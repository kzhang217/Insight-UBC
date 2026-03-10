import {InsightDatasetKind, InsightError} from "./IInsightFacade";
import {KeyCollector} from "./KeyCollector";

export class FieldAccess {
	private readonly keyCollector = new KeyCollector();

	isSectionsStringField(field: string): boolean {
		return ["dept", "id", "instructor", "title", "uuid"].includes(field);
	}

	isSectionsNumericField(field: string): boolean {
		return ["avg", "year", "pass", "fail", "audit"].includes(field);
	}

	isRoomsStringField(field: string): boolean {
		return ["fullname", "shortname", "number", "name", "address", "type", "furniture", "href"].includes(field);
	}

	isRoomsNumericField(field: string): boolean {
		return ["lat", "lon", "seats"].includes(field);
	}

	getFieldValue(row: any, field: string, kind: InsightDatasetKind): string | number | undefined {
		if (kind === InsightDatasetKind.Sections) {
			switch (field) {
				case "dept":
					return row.dept;
				case "id":
					return row.id;
				case "instructor":
					return row.instructor;
				case "title":
					return row.title;
				case "uuid":
					return row.uuid;
				case "avg":
					return row.avg;
				case "year":
					return row.year;
				case "pass":
					return row.pass;
				case "fail":
					return row.fail;
				case "audit":
					return row.audit;
				default:
					return undefined;
			}
		} else {
			switch (field) {
				case "fullname":
					return row.fullname;
				case "shortname":
					return row.shortname;
				case "number":
					return row.number;
				case "name":
					return row.name;
				case "address":
					return row.address;
				case "lat":
					return row.lat;
				case "lon":
					return row.lon;
				case "seats":
					return row.seats;
				case "type":
					return row.type;
				case "furniture":
					return row.furniture;
				case "href":
					return row.href;
				default:
					return undefined;
			}
		}
	}

	getFieldValueWithKey(row: any, key: string, kind: InsightDatasetKind): string | number | undefined {
		const { field } = this.keyCollector.splitKey(key);
		return this.getFieldValue(row, field, kind);
	}

	getNumericField(row: any, field: string, kind: InsightDatasetKind): number | undefined {
		const v = this.getFieldValue(row, field, kind);
		return typeof v === "number" ? v : undefined;
	}

	getStringField(row: any, field: string, kind: InsightDatasetKind): string | undefined {
		const v = this.getFieldValue(row, field, kind);
		return typeof v === "string" ? v : undefined;
	}

	matchesIS(actual: string, pattern: string): boolean {
		if (!pattern.includes("*")) {
			return actual === pattern;
		}
		const middleAsterisk = pattern.slice(1, -1).includes("*");
		if (middleAsterisk) {
			throw new InsightError("IS pattern may only have '*' at the start and/or end.");
		}

		const startsWithStar = pattern.startsWith("*");
		const endsWithStar = pattern.endsWith("*");
		const core = pattern.replace(/^\*/, "").replace(/\*$/, "");

		if (startsWithStar && endsWithStar) {
			return actual.includes(core);
		} else if (startsWithStar) {
			return actual.endsWith(core);
		} else if (endsWithStar) {
			return actual.startsWith(core);
		}
		return actual === core;
	}


}
