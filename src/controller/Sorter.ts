import {InsightError, InsightResult} from "./IInsightFacade";
import {KeyCollector} from "./KeyCollector";

export class Sorter {
	constructor(private readonly kc = new KeyCollector()) {}

	sortResults(rows: InsightResult[], order: any, columns: string[], datasetId: string): InsightResult[] {
		const ensureKeysInColumns = (keys: string[]) => {
			for (const k of keys) {
				if (!columns.includes(k)) {
					throw new InsightError("ORDER key must be present in COLUMNS.");
				}
				if (k.includes("_")) {
					const { id } = this.kc.splitKey(k);
					if (id !== datasetId) {
						throw new InsightError("ORDER cannot reference multiple datasets.");
					}
				}
			}
		};

		if (typeof order === "string") {
			ensureKeysInColumns([order]);
			const key = order;
			return [...rows].sort((a, b) => this.compareByKey(a, b, key, "UP"));
		}

		if (order === null || typeof order !== "object" || Array.isArray(order)) {
			throw new InsightError("ORDER must be a string or an object.");
		}
		const { dir, keys } = order;
		if (dir !== "UP" && dir !== "DOWN") {
			throw new InsightError("ORDER.dir must be 'UP' or 'DOWN'.");
		}
		if (!Array.isArray(keys) || keys.length === 0) {
			throw new InsightError("ORDER.keys must be a non-empty array.");
		}
		ensureKeysInColumns(keys);

		return [...rows].sort((a, b) => {
			for (const k of keys) {
				const cmp = this.compareByKey(a, b, k, dir);
				if (cmp !== 0) return cmp;
			}
			return 0;
		});
	}

	compareByKey(a: InsightResult, b: InsightResult, key: string, dir: "UP" | "DOWN"): number {
		const va = a[key];
		const vb = b[key];
		let cmp: number;
		if (typeof va === "number" && typeof vb === "number") {
			cmp = va < vb ? -1 : va > vb ? 1 : 0;
		} else {
			const sa = String(va);
			const sb = String(vb);
			cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
		}
		return dir === "UP" ? cmp : -cmp;
	}
}
