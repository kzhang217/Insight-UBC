// src/controller/AddRoomsHelper.ts
import JSZip from "jszip";
import * as parse5 from "parse5";
import http from "http";
import { InsightError } from "./IInsightFacade";
import { Room, Building } from "./InsightFacade";

type P5Node = any;

const TD_BUILDING_TITLE = "views-field-title";
const TD_BUILDING_ADDR = "views-field-field-building-address";
const TD_BUILDING_CODE = "views-field-field-building-code";

const TD_ROOM_NUMBER = "views-field-field-room-number";
const TD_ROOM_SEATS = "views-field-field-room-capacity";
const TD_ROOM_TYPE = "views-field-field-room-type";
const TD_ROOM_FURN = "views-field-field-room-furniture";
const TD_ROOM_LINK = "views-field-nothing";

export class AddRoomsHelper {
	constructor(private readonly teamNo: string) {}

	public async parseRoomsZip(base64Zip: string): Promise<Room[]> {
		const zip = await this.loadZip(base64Zip);

		const indexFile = zip.file("index.htm");
		if (!indexFile) throw new InsightError("index.htm missing at zip root");
		const indexHtml = await indexFile.async("string");
		const indexDoc = parse5.parse(indexHtml) as P5Node;

		const buildingTable = this.findBuildingTable(indexDoc);
		if (!buildingTable) throw new InsightError("building table not found");

		const buildings = this.parseBuildings(buildingTable);

		const allRooms: Room[] = [];
		for (const b of buildings) {
			const rel = this.normalizeHref(b.pathToRooms);
			const file = zip.file(rel);
			if (!file) continue;

			const html = await file.async("string");
			const doc = parse5.parse(html) as P5Node;

			const roomTable = this.findRoomTable(doc);
			if (!roomTable) continue;

			const rows = this.parseRooms(roomTable);
			if (rows.length === 0) continue;

			for (const r of rows) {
				const room = new Room(
					b.fullname,
					b.shortname,
					r.number,
					`${b.shortname}_${r.number}`, // name
					b.address,
					Number.NaN, // lat
					Number.NaN, // lon
					r.seats,
					r.type,
					r.furniture,
					r.href
				);
				allRooms.push(room);
			}
		}

		await this.enrichWithGeolocation(allRooms);

		const valid = allRooms.filter((r: any) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

		return valid;
	}

	private async loadZip(base64Zip: string): Promise<JSZip> {
		try {
			const zip = await JSZip.loadAsync(base64Zip, { base64: true });
			const hasAnyEntries = Object.values(zip.files).some((f) => !f.dir);
			if (!hasAnyEntries) throw new InsightError("empty zip");
			return zip;
		} catch {
			throw new InsightError("not a base64 zip");
		}
	}

	private normalizeHref(href: string): string {
		return href.replace(/^\.\/+/, "");
	}

	private async geocode(address: string): Promise<{ lat: number; lon: number } | null> {
		const encoded = encodeURIComponent(address);
		const url = `http://cs310.students.cs.ubc.ca:11316/api/v1/project_team${this.teamNo}/${encoded}`;

		return new Promise((resolve) => {
			http
				.get(url, (res) => {
					let data = "";
					res.on("data", (c) => (data += c));
					res.on("end", () => {
						try {
							const j = JSON.parse(data);
							if (typeof j.lat === "number" && typeof j.lon === "number") resolve({ lat: j.lat, lon: j.lon });
							else resolve(null);
						} catch {
							resolve(null);
						}
					});
				})
				.on("error", () => resolve(null));
		});
	}

	private async enrichWithGeolocation(rooms: Room[]) {
		const buckets = new Map<string, Room[]>();
		for (const r of rooms as any as Array<{ address: string } & Room>) {
			if (!buckets.has(r.address)) buckets.set(r.address, []);
			buckets.get(r.address)!.push(r as any as Room);
		}

		for (const [addr, group] of buckets) {
			const geo = await this.geocode(addr);
			if (geo) {
				for (const r of group as any as Array<{ lat: number; lon: number }>) {
					r.lat = geo.lat;
					r.lon = geo.lon;
				}
			}
		}
	}

	private *walk(node: P5Node): Generator<P5Node> {
		if (!node) return;
		yield node;
		const kids = node.childNodes ?? [];
		for (const c of kids) yield* this.walk(c);
	}

	private findAll(node: P5Node, pred: (n: P5Node) => boolean): P5Node[] {
		const out: P5Node[] = [];
		for (const n of this.walk(node)) if (pred(n)) out.push(n);
		return out;
	}

	private findFirst(node: P5Node, pred: (n: P5Node) => boolean): P5Node | undefined {
		for (const n of this.walk(node)) if (pred(n)) return n;
		return undefined;
	}

	private isTag(n: P5Node, tag: string): boolean {
		return n?.tagName === tag;
	}

	private getAttr(n: P5Node, name: string): string | undefined {
		const attrs = n?.attrs as Array<{ name: string; value: string }> | undefined;
		return attrs?.find((a) => a.name === name)?.value;
	}

	private hasClass(n: P5Node, cls: string): boolean {
		const val = this.getAttr(n, "class");
		return !!val && val.split(/\s+/).includes(cls);
	}

	private textOf(n: P5Node): string {
		if (!n) return "";
		if (n.nodeName === "#text") return (n.value ?? n.data ?? "").trim();
		const kids = n.childNodes ?? [];
		return kids
			.map((c: P5Node) => this.textOf(c))
			.join(" ")
			.trim();
	}

	private findBuildingTable(doc: P5Node): P5Node | undefined {
		const tables = this.findAll(doc, (n) => this.isTag(n, "table"));
		for (const table of tables) {
			const tds = this.findAll(table, (n) => this.isTag(n, "td"));
			const ok =
				tds.some((td) => this.hasClass(td, TD_BUILDING_TITLE)) &&
				tds.some((td) => this.hasClass(td, TD_BUILDING_ADDR)) &&
				tds.some((td) => this.hasClass(td, TD_BUILDING_CODE));
			if (ok) return table;
		}
		return undefined;
	}

	private parseBuildings(table: P5Node): Building[] {
		const rows = this.findAll(table, (n) => this.isTag(n, "tr"));
		const out: Building[] = [];

		for (const tr of rows) {
			const tds: P5Node[] = (tr.childNodes ?? []).filter((n: P5Node) => this.isTag(n, "td"));
			if (!tds.length) continue;

			const titleTd = tds.find((td: P5Node) => this.hasClass(td, TD_BUILDING_TITLE));
			const addrTd = tds.find((td: P5Node) => this.hasClass(td, TD_BUILDING_ADDR));
			const codeTd = tds.find((td: P5Node) => this.hasClass(td, TD_BUILDING_CODE));
			if (!titleTd || !addrTd || !codeTd) continue;

			const a = this.findFirst(titleTd, (n) => this.isTag(n, "a"));
			const href = a ? (this.getAttr(a, "href") ?? "") : "";
			if (!href) continue;

			const fullname = a ? this.textOf(a) : this.textOf(titleTd);
			const address = this.textOf(addrTd);
			const shortname = this.textOf(codeTd) || this.fileStem(href);

			out.push(new Building(fullname, shortname, address, href));
		}

		return out;
	}

	private fileStem(href: string): string {
		const m = href.match(/([^\/]+)\.htm$/i);
		return m ? m[1] : "";
	}

	private findRoomTable(doc: P5Node): P5Node | undefined {
		const tables = this.findAll(doc, (n) => this.isTag(n, "table"));
		for (const table of tables) {
			const tds = this.findAll(table, (n) => this.isTag(n, "td"));
			const ok =
				tds.some((td) => this.hasClass(td, TD_ROOM_NUMBER)) && tds.some((td) => this.hasClass(td, TD_ROOM_SEATS));
			if (ok) return table;
		}
		return undefined;
	}

	private parseRooms(table: P5Node): Array<{
		number: string;
		seats: number;
		type: string;
		furniture: string;
		href: string;
	}> {
		const rows = this.findAll(table, (n) => this.isTag(n, "tr"));
		const out: Array<{ number: string; seats: number; type: string; furniture: string; href: string }> = [];

		for (const tr of rows) {
			const tds: P5Node[] = (tr.childNodes ?? []).filter((n: P5Node) => this.isTag(n, "td"));
			if (!tds.length) continue;

			const numberTd = tds.find((td) => this.hasClass(td, TD_ROOM_NUMBER));
			const seatsTd = tds.find((td) => this.hasClass(td, TD_ROOM_SEATS));
			const typeTd = tds.find((td) => this.hasClass(td, TD_ROOM_TYPE));
			const furnTd = tds.find((td) => this.hasClass(td, TD_ROOM_FURN));
			const linkTd = tds.find((td) => this.hasClass(td, TD_ROOM_LINK));

			if (!numberTd || !seatsTd || !typeTd || !furnTd) continue;

			let href = "";
			const aInLink = linkTd ? this.findFirst(linkTd, (n) => this.isTag(n, "a")) : undefined;
			if (aInLink) {
				href = this.getAttr(aInLink, "href") ?? "";
			}

			if (!href) {
				const aInNumber = this.findFirst(numberTd, (n) => this.isTag(n, "a"));
				href = aInNumber ? (this.getAttr(aInNumber, "href") ?? "") : "";
			}

			const numText = this.textOf(numberTd);
			const seatsText = this.textOf(seatsTd);
			const typeText = this.textOf(typeTd);
			const furnText = this.textOf(furnTd);

			const seats = Number((seatsText ?? "").trim()) || 0;

			out.push({
				number: numText,
				seats,
				type: typeText,
				furniture: furnText,
				href,
			});
		}

		return out;
	}
}
