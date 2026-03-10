// src/controller/InsightFacade.ts
import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightResult,
	NotFoundError,
	InsightError,
	ResultTooLargeError,
} from "./IInsightFacade";

import * as fs from "fs-extra";
import * as path from "path";
import JSZip from "jszip";
import Decimal from "decimal.js";
import { AddRoomsHelper } from "./AddRoomsHelper";
import { KeyCollector } from "./KeyCollector";
import {FieldAccess} from "./FieldAccess";
import {Sorter} from "./Sorter";
import {GroupApply} from "./GroupApply";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 */

//representing a section
export class Section {
	public readonly uuid: string;
	public readonly id: string;
	public readonly title: string;
	public readonly instructor: string;
	public readonly dept: string;
	public readonly year: number;
	public readonly avg: number;
	public readonly pass: number;
	public readonly fail: number;
	public readonly audit: number;

	constructor(
		uuid: string,
		id: string,
		title: string,
		instructor: string,
		dept: string,
		year: number,
		avg: number,
		pass: number,
		fail: number,
		audit: number
	) {
		this.uuid = uuid;
		this.id = id;
		this.title = title;
		this.instructor = instructor;
		this.dept = dept;
		this.year = year;
		this.avg = avg;
		this.pass = pass;
		this.fail = fail;
		this.audit = audit;
	}
}

export class Room {
	public readonly fullname: string;
	public readonly shortname: string;
	public readonly number: string;
	public readonly name: string;
	public readonly address: string;
	public lat: number;
	public lon: number;
	public readonly seats: number;
	public readonly type: string;
	public readonly furniture: string;
	public readonly href: string;

	constructor(
		fullname: string,
		shortname: string,
		number: string,
		name: string,
		address: string,
		lat: number,
		lon: number,
		seats: number,
		type: string,
		furniture: string,
		href: string
	) {
		this.fullname = fullname;
		this.shortname = shortname;
		this.number = number;
		this.name = name;
		this.address = address;
		this.lat = lat;
		this.lon = lon;
		this.seats = seats;
		this.type = type;
		this.furniture = furniture;
		this.href = href;
	}
}

export class Building {
	public readonly fullname: string;
	public readonly shortname: string;
	public readonly address: string;
	public lat: number = -1;
	public lon: number = -1;
	public readonly pathToRooms: string;

	constructor(fullname: string, shortname: string, address: string, pathToRooms: string) {
		this.fullname = fullname;
		this.shortname = shortname;
		this.address = address;
		this.pathToRooms = pathToRooms;
	}
}

export default class InsightFacade implements IInsightFacade {
	private datasets: InsightDataset[];
	private readonly dataDir = path.join(__dirname, "../../data");
	private readonly ready: Promise<void>;
	private readonly keyCollector = new KeyCollector();
	private readonly fieldAccess= new FieldAccess();
	private readonly groupApply = new GroupApply(this.fieldAccess);
	private readonly sorter = new Sorter(this.keyCollector);



	constructor() {
		this.datasets = [];
		this.ready = this.loadDatasets();
	}

	// -------------------------------------------------------------------

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		await this.ready;

		if (!this.isValidId(id)) {
			throw new InsightError("Invalid id");
		}
		for (const dataset of this.datasets) {
			if (dataset.id === id) {
				throw new InsightError("Dataset with the same id already exists");
			}
		}

		if (kind === InsightDatasetKind.Sections) {
			let zip: JSZip;
			try {
				zip = await JSZip.loadAsync(content, { base64: true });
			} catch {
				throw new InsightError("Not structured as a base64 string of a zip file");
			}
			const hasAnyEntries = Object.values(zip.files).some((f) => !f.dir);
			if (!hasAnyEntries) {
				throw new InsightError("Empty zip file");
			}

			const tuples = await this.processSectionZipFile(zip);
			if (tuples.length === 0) {
				throw new InsightError("No valid tuples found in the dataset");
			}

			await fs.ensureDir(this.dataDir);
			await fs.writeJson(path.join(this.dataDir, `${id}.json`), tuples);
			this.datasets.push({ id, kind, numRows: tuples.length });
			await this.saveDatasets();
			return this.datasets.map((d) => d.id);
		}

		if (kind === InsightDatasetKind.Rooms) {
			const helper = new AddRoomsHelper("054");
			const rooms: Room[] = await helper.parseRoomsZip(content);

			await fs.ensureDir(this.dataDir);
			await fs.writeJson(path.join(this.dataDir, `${id}.json`), { kind, rows: rooms });
			this.datasets.push({ id, kind, numRows: rooms.length });
			await this.saveDatasets();
			return this.datasets.map((d) => d.id);
		}

		throw new InsightError("Invalid dataset kind");
	}

	public async removeDataset(id: string): Promise<string> {
		await this.ready;
		if (!this.isValidId(id)) {
			throw new InsightError("Invalid id");
		}

		const idx = this.datasets.findIndex((d) => d.id === id);
		if (idx === -1) {
			throw new NotFoundError(`Dataset with id '${id}' not found`);
		}

		const filePath = path.join(this.dataDir, `${id}.json`);
		try {
			await fs.remove(filePath);
		} catch {
			throw new InsightError("Failed to remove dataset file from disk");
		}

		this.datasets.splice(idx, 1);
		await this.saveDatasets();

		return id;
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		await this.ready;
		return this.datasets.map((d) => ({
			id: d.id,
			kind: d.kind,
			numRows: d.numRows,
		}));
	}

	// -----------------------------------------------performQuery ---------------------------------------

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		await this.ready;

		// 1) Structure validation
		if (query === null || typeof query !== "object" || Array.isArray(query)) {
			throw new InsightError("Query must be a non-null object.");
		}
		const q = query as Record<string, any>;
		if (!("WHERE" in q) || !("OPTIONS" in q)) {
			throw new InsightError("Query must contain WHERE and OPTIONS.");
		}

		const where = q.WHERE;
		if (where === null || typeof where !== "object" || Array.isArray(where)) {
			throw new InsightError("WHERE must be an object.");
		}

		const options = q.OPTIONS;
		if (options === null || typeof options !== "object" || Array.isArray(options)) {
			throw new InsightError("OPTIONS must be an object.");
		}
		if (!("COLUMNS" in options)) {
			throw new InsightError("OPTIONS must include COLUMNS.");
		}
		if (!Array.isArray(options.COLUMNS) || options.COLUMNS.length === 0) {
			throw new InsightError("COLUMNS must be a non-empty array.");
		}

		const order = options.ORDER;
		const transformations = q.TRANSFORMATIONS;

		// 2) Gather keys and dataset id
		const columns: string[] = options.COLUMNS;
		const whereKeys = this.keyCollector.collectWhereFieldKeys(where);
		const orderKeys = this.keyCollector.collectOrderFieldKeys(order);
		const { groupKeys, applyKeys, applyFieldKeys, hasTransformations } =
			this.keyCollector.collectTransformKeys(transformations);

		const allFieldLikeKeys = new Set<string>([
			...whereKeys,
			...columns.filter((k) => typeof k === "string" && k.includes("_")),
			...orderKeys.filter((k) => typeof k === "string" && k.includes("_")),
			...applyFieldKeys,
			...groupKeys,
		]);

		const referencedIds = this.keyCollector.collectDatasetIds(allFieldLikeKeys);
		if (referencedIds.size !== 1) {
			throw new InsightError("Query must reference exactly one dataset id.");
		}
		const datasetId = [...referencedIds][0];

		const datasetMeta = this.datasets.find((d) => d.id === datasetId);
		if (!datasetMeta) {
			throw new InsightError(`Dataset '${datasetId}' has not been added.`);
		}

		// 3) Load dataset rows from disk (support your two persisted shapes)
		const dataPath = path.join(this.dataDir, `${datasetId}.json`);
		let rows: any[];
		try {
			const raw = await fs.readJSON(dataPath);
			if (Array.isArray(raw)) {
				rows = raw;
			} else if (raw && Array.isArray(raw.rows)) {
				rows = raw.rows;
			} else {
				throw new InsightError("Dataset on disk is malformed.");
			}
		} catch {
			throw new InsightError("Failed to load dataset from disk.");
		}

		// 4) WHERE filtering
		const filtered = this.evaluateWhere(where, rows, datasetId, datasetMeta.kind);

		// 5) TRANSFORMATIONS (GROUP/APPLY)
		let postTransformRows: any[] = filtered;
		if (hasTransformations) {
			this.keyCollector.validateColumnsWithTransformations(columns, groupKeys, applyKeys);

			const groupsMap = this.groupApply.groupByKeys(postTransformRows, groupKeys);

			const transformed: any[] = [];
			for (const [, groupRows] of groupsMap) {
				const base: Record<string, any> = {};
				for (const gKey of groupKeys) {
					base[gKey] = this.fieldAccess.getFieldValueWithKey(groupRows[0], gKey, datasetMeta.kind);
				}

				for (const rule of transformations.APPLY as any[]) {
					const applyKey: string = Object.keys(rule)[0];
					const applyObj = rule[applyKey];
					const token: string = Object.keys(applyObj)[0];
					const fieldKey: string = applyObj[token];

					const { field } = this.keyCollector.splitKey(fieldKey);
					const values = groupRows.map((r) => this.fieldAccess.getFieldValue(r, field, datasetMeta.kind));
					base[applyKey] = this.groupApply.applyToken(token, values, field, datasetMeta.kind);
				}
				transformed.push(base);
			}
			postTransformRows = transformed;
		} else {
			for (const c of columns) {
				if (typeof c !== "string") {
					throw new InsightError("COLUMNS entries must be strings.");
				}
				if (!c.includes("_")) {
					throw new InsightError("COLUMNS contains an invalid key without underscore for non-transform query.");
				}
				const { id } = this.keyCollector.splitKey(c);
				if (id !== datasetId) {
					throw new InsightError("COLUMNS cannot reference multiple datasets.");
				}
			}
		}

		// 6) Project COLUMNS
		let projected: InsightResult[];
		if (hasTransformations) {
			projected = postTransformRows.map((row) => {
				const out: InsightResult = {};
				for (const col of columns) {
					if (col.includes("_")) {
						const { id, field } = this.keyCollector.splitKey(col);
						if (id !== datasetId) {
							throw new InsightError("COLUMNS cannot reference multiple datasets.");
						}
						const v = row[col] ?? this.fieldAccess.getFieldValue(row, field, datasetMeta.kind);
						this.groupApply.assertResultType(v, field, datasetMeta.kind, col);
						out[col] = v;
					} else {
						const v = row[col];
						if (v === undefined || (typeof v !== "number" && typeof v !== "string")) {
							throw new InsightError(`Invalid APPLY key in COLUMNS: '${col}'.`);
						}
						out[col] = v;
					}
				}
				return out;
			});
		} else {
			projected = postTransformRows.map((row) => this.projectRow(row, columns, datasetId, datasetMeta.kind));
		}

		// 7) ORDER
		let result = projected;
		if (order !== undefined) {
			if (!hasTransformations) {
				if (typeof order === "string") {
					if (!order.includes("_")) {
						throw new InsightError(
							"ORDER key must be a dataset key '<id>_<field>' when no TRANSFORMATIONS are present."
						);
					}
				} else if (order && typeof order === "object" && !Array.isArray(order)) {
					const { keys } = order;
					if (!Array.isArray(keys) || keys.some((k: any) => typeof k !== "string" || !k.includes("_"))) {
						throw new InsightError(
							"ORDER keys must be dataset keys '<id>_<field>' when no TRANSFORMATIONS are present."
						);
					}
				}
			}
			result = this.sorter.sortResults(result, order, columns, datasetId);
		}

		// 8) Size limit
		if (result.length > 5000) {
			throw new ResultTooLargeError("Query result too large (> 5000).");
		}
		return result;
	}

	// ------------------------------------------ helpers------------------------------------------------------------------

	private async saveDatasets(): Promise<void> {
		try {
			await fs.ensureDir(this.dataDir);
			const filePath = path.join(this.dataDir, "datasets.json");
			await fs.writeJson(filePath, this.datasets, { spaces: 2 });
		} catch (error) {}
	}

	private async loadDatasets(): Promise<void> {
		try {
			await fs.ensureDir(this.dataDir);
			const filePath = path.join(this.dataDir, "datasets.json");

			const exists = await fs.pathExists(filePath);
			if (!exists) {
				this.datasets = [];
				return;
			}

			const parsed = await fs.readJSON(filePath);
			this.datasets = Array.isArray(parsed) ? parsed : [];
		} catch {
			this.datasets = [];
		}
	}

	private isValidId(id: string): boolean {
		if (id === null || typeof id !== "string") return false;
		if (!id.trim()) return false;
		if (id.includes("_")) return false;
		return true;
	}

	public async processSectionZipFile(zip: JSZip): Promise<Section[]> {
		const candidates: JSZip.JSZipObject[] = [];

		const coursesFolder = zip.folder("courses");
		if (coursesFolder) {
			coursesFolder.forEach((rel, file) => {
				if (!file.dir) {
					candidates.push(file);
				}
			});
		}

		if (candidates.length === 0) {
			for (const f of Object.values(zip.files)) {
				if (!f.dir) {
					const name = f.name.replace(/^\.\/+/, "");
					if (/(^|\/)courses\/[^/]+$/i.test(name)) {
						candidates.push(f);
					}
				}
			}
		}

		if (candidates.length === 0) {
			throw new InsightError("Sections dataset must contain files under 'courses/' (extension optional)");
		}
		const sectionsArray = await Promise.all(candidates.map((f) => this.extractSections(f)));
		return sectionsArray.flat();
	}

	public async extractSections(file: JSZip.JSZipObject): Promise<Section[]> {
		const fileContent = await file.async("string");

		let jsonObject: any;
		try {
			jsonObject = JSON.parse(fileContent);
		} catch {
			return [];
		}

		const resultArray = jsonObject.result;
		if (!Array.isArray(resultArray)) {
			return [];
		}

		const sections: Section[] = [];

		for (const obj of resultArray) {
			if (
				obj.id === undefined ||
				obj.Course === undefined ||
				obj.Title === undefined ||
				obj.Professor === undefined ||
				obj.Subject === undefined ||
				obj.Year === undefined ||
				obj.Avg === undefined ||
				obj.Pass === undefined ||
				obj.Fail === undefined ||
				obj.Audit === undefined
			) {
				continue;
			}

			const sectionLabel: string | undefined = obj.Section;

			const uuid = obj.id;
			const id = obj.Course;
			const title = obj.Title;
			const instructor = obj.Professor;
			const dept = obj.Subject;
			const year = sectionLabel === "overall" ? 1900 : Number(obj.Year);
			const avg = Number(obj.Avg);
			const pass = Number(obj.Pass);
			const fail = Number(obj.Fail);
			const audit = Number(obj.Audit);

			if ([year, avg, pass, fail, audit].some((n) => Number.isNaN(n))) {
				continue;
			}

			sections.push(new Section(uuid, id, title, instructor, dept, year, avg, pass, fail, audit));
		}

		return sections;
	}

	private evaluateWhere(where: any, rows: any[], datasetId: string, kind: InsightDatasetKind): any[] {
		if (Object.keys(where).length === 0) {
			return rows;
		}
		return rows.filter((row) => this.matchesFilter(row, where, datasetId, kind));
	}

	private matchesFilter(row: any, filter: any, datasetId: string, kind: InsightDatasetKind): boolean {
		const op = Object.keys(filter)[0];

		if (op === "AND") {
			const arr = filter.AND;
			if (!Array.isArray(arr) || arr.length === 0) {
				throw new InsightError("AND must be a non-empty array.");
			}
			return arr.every((sub) => this.matchesFilter(row, sub, datasetId, kind));
		}

		if (op === "OR") {
			const arr = filter.OR;
			if (!Array.isArray(arr) || arr.length === 0) {
				throw new InsightError("OR must be a non-empty array.");
			}
			return arr.some((sub) => this.matchesFilter(row, sub, datasetId, kind));
		}

		if (op === "NOT") {
			const sub = filter.NOT;
			if (sub === null || typeof sub !== "object") {
				throw new InsightError("NOT must wrap a filter object.");
			}
			return !this.matchesFilter(row, sub, datasetId, kind);
		}

		if (op === "LT" || op === "GT" || op === "EQ") {
			const inner = filter[op];
			const fieldKey = this.keyCollector.validateSingleFieldMapping(inner, op);
			const value = inner[fieldKey];

			const { id, field } = this.keyCollector.splitKey(fieldKey);
			if (id !== datasetId) {
				throw new InsightError("WHERE cannot reference multiple datasets.");
			}

			if (typeof value !== "number") {
				throw new InsightError(`${op} comparison value must be a number.`);
			}
			const numericValue = this.fieldAccess.getNumericField(row, field, kind);
			if (numericValue === undefined) {
				throw new InsightError(`Field '${field}' is not a numeric field for this dataset.`);
			}

			if (op === "LT") return numericValue < value;
			if (op === "GT") return numericValue > value;
			return numericValue === value;
		}

		if (op === "IS") {
			const inner = filter.IS;
			const fieldKey = this.keyCollector.validateSingleFieldMapping(inner, "IS");
			const value = inner[fieldKey];

			const { id, field } = this.keyCollector.splitKey(fieldKey);
			if (id !== datasetId) {
				throw new InsightError("WHERE cannot reference multiple datasets.");
			}
			if (typeof value !== "string") {
				throw new InsightError("IS comparison value must be a string.");
			}
			const stringValue = this.fieldAccess.getStringField(row, field, kind);
			if (stringValue === undefined) {
				throw new InsightError(`Field '${field}' is not a string field for this dataset.`);
			}

			return this.fieldAccess.matchesIS(stringValue, value);
		}

		throw new InsightError(`Unknown WHERE operator: ${op}`);
	}

	private projectRow(row: any, columns: string[], datasetId: string, kind: InsightDatasetKind): InsightResult {
		const out: InsightResult = {};
		for (const col of columns) {
			if (typeof col !== "string") {
				throw new InsightError("COLUMNS entries must be strings.");
			}
			if (!col.includes("_")) {
				throw new InsightError("COLUMNS contains an invalid key without underscore for non-transform query.");
			}
			const { id, field } = this.keyCollector.splitKey(col);
			if (id !== datasetId) {
				throw new InsightError("COLUMNS cannot reference multiple datasets.");
			}
			const v = this.fieldAccess.getFieldValue(row, field, kind);
			if (v === undefined || (typeof v !== "string" && typeof v !== "number")) {
				throw new InsightError(`Invalid field in COLUMNS: '${field}'.`);
			}
			out[col] = v;
		}
		return out;
	}

}
