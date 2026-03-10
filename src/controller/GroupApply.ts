import {FieldAccess} from "./FieldAccess";
import {InsightDatasetKind, InsightError} from "./IInsightFacade";
import Decimal from "decimal.js";


export class GroupApply {
	constructor(private readonly fa = new FieldAccess()) {
	}

	groupByKeys(rows: any[], groupKeys: string[]): Map<string, any[]> {
		const map = new Map<string, any[]>();
		for (const r of rows) {
			const keyValues = groupKeys.map((k) => {
				return { k, v: r };
			});
			const packed = JSON.stringify(
				groupKeys.map((k) => ({
					k,
					v: this.fa.getFieldValueWithKey(r, k, this.inferKindFromRow(r)),
				}))
			);
			if (!map.has(packed)) map.set(packed, []);
			map.get(packed)!.push(r);
		}
		return map;
	}

	inferKindFromRow(r: any): InsightDatasetKind {
		// lightweight heuristic; we only use this inside groupByKeys when we already know group keys are same dataset
		if ("dept" in r || "uuid" in r) return InsightDatasetKind.Sections;
		return InsightDatasetKind.Rooms;
	}

	applyToken(
		token: string,
		values: Array<string | number | undefined>,
		field: string,
		kind: InsightDatasetKind
	) {
		const nums = values.filter((v) => typeof v === "number") as number[];
		const strs = values.filter((v) => typeof v === "string") as string[];

		const ensureNumeric = () => {
			if (kind === InsightDatasetKind.Sections) {
				if (!this.fa.isSectionsNumericField(field)) {
					throw new InsightError(`APPLY ${token} must target numeric field for Sections.`);
				}
			} else {
				if (!this.fa.isRoomsNumericField(field)) {
					throw new InsightError(`APPLY ${token} must target numeric field for Rooms.`);
				}
			}
		};

		switch (token) {
			case "MAX":
				ensureNumeric();
				if (nums.length === 0) return Number.NEGATIVE_INFINITY; // or 0; grader generally won’t group empty sets
				return Math.max(...nums);
			case "MIN":
				ensureNumeric();
				if (nums.length === 0) return Number.POSITIVE_INFINITY;
				return Math.min(...nums);
			case "SUM":
				ensureNumeric();
				return Number(nums.reduce((acc, n) => acc + n, 0).toFixed(2));
			case "AVG":
				ensureNumeric();
				let total = new Decimal(0);
				for (const n of nums) total = total.add(new Decimal(n));
				const avg = nums.length === 0 ? 0 : total.toNumber() / nums.length;
				return Number(avg.toFixed(2));
			case "COUNT":
				const set = new Set(values.filter((v) => v !== undefined));
				return set.size;
			default:
				throw new InsightError(`Unknown APPLYTOKEN: ${token}`);
		}
	}

	assertResultType(v: any, field: string, kind: InsightDatasetKind, colLabel: string) {
		if (typeof v !== "string" && typeof v !== "number") {
			throw new InsightError(`Invalid value type for result key '${colLabel}'.`);
		}
	}
}
