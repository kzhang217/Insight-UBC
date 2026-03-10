import { InsightError } from "./IInsightFacade";

export class KeyCollector {
	collectWhereFieldKeys(where: any): string[] {
		const keys: string[] = [];
		if (where === null || typeof where !== "object") {
			return keys;
		}
		if (Object.keys(where).length === 0) {
			return keys;
		}

		const op = Object.keys(where)[0];

		if (op === "AND" || op === "OR") {
			const arr = where[op];
			if (!Array.isArray(arr) || arr.length === 0) {
				throw new InsightError(`${op} must be a non-empty array.`);
			}
			for (const sub of arr) {
				keys.push(...this.collectWhereFieldKeys(sub));
			}
			return keys;
		}

		if (op === "NOT") {
			const sub = where[op];
			if (sub === null || typeof sub !== "object") {
				throw new InsightError("NOT must wrap a filter object.");
			}
			keys.push(...this.collectWhereFieldKeys(sub));
			return keys;
		}

		if (op === "LT" || op === "GT" || op === "EQ") {
			const inner = where[op];
			if (inner === null || typeof inner !== "object") {
				throw new InsightError(`${op} must be an object mapping a numeric field to a number.`);
			}
			const fieldKeys = Object.keys(inner);
			if (fieldKeys.length !== 1) {
				throw new InsightError(`${op} must have exactly one field key.`);
			}
			keys.push(fieldKeys[0]);
			return keys;
		}

		if (op === "IS") {
			const inner = where[op];
			if (inner === null || typeof inner !== "object") {
				throw new InsightError("IS must be an object mapping a string field to a string.");
			}
			const fieldKeys = Object.keys(inner);
			if (fieldKeys.length !== 1) {
				throw new InsightError("IS must have exactly one field key.");
			}
			keys.push(fieldKeys[0]);
			return keys;
		}

		throw new InsightError(`Unknown WHERE operator: ${op}`);
	}

	collectOrderFieldKeys(order: any): string[] {
		if (order === undefined) {
			return [];
		}
		if (typeof order === "string") {
			return [order];
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
		for (const k of keys) {
			if (typeof k !== "string") {
				throw new InsightError("ORDER.keys must contain only strings.");
			}
		}
		return keys;
	}

	collectTransformKeys(transformations: any): {
		hasTransformations: boolean;
		groupKeys: string[];
		applyKeys: string[];
		applyFieldKeys: string[];
	} {
		if (transformations === undefined) {
			return { hasTransformations: false, groupKeys: [], applyKeys: [], applyFieldKeys: [] };
		}
		if (transformations === null || typeof transformations !== "object" || Array.isArray(transformations)) {
			throw new InsightError("TRANSFORMATIONS must be an object.");
		}
		const { GROUP, APPLY } = transformations;

		if (!Array.isArray(GROUP)) {
			throw new InsightError("GROUP must be an array.");
		}
		if (GROUP.length === 0) {
			throw new InsightError("GROUP must contain at least one key.");
		}
		for (const g of GROUP) {
			if (typeof g !== "string" || !g.includes("_")) {
				throw new InsightError("GROUP keys must be dataset keys of the form '<id>_<field>'.");
			}
		}

		if (APPLY !== undefined && !Array.isArray(APPLY)) {
			throw new InsightError("APPLY must be an array if present.");
		}

		const applyKeys: string[] = [];
		const applyFieldKeys: string[] = [];

		if (Array.isArray(APPLY)) {
			const usedApplyNames = new Set<string>();
			for (const rule of APPLY) {
				if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
					throw new InsightError("Each APPLYRULE must be an object.");
				}
				const applyKeyNames = Object.keys(rule);
				if (applyKeyNames.length !== 1) {
					throw new InsightError("Each APPLYRULE must have exactly one applykey.");
				}
				const applyKey = applyKeyNames[0];
				if (applyKey.includes("_")) {
					throw new InsightError("applykey must not contain underscore.");
				}
				if (usedApplyNames.has(applyKey)) {
					throw new InsightError("applykey must be unique within APPLY.");
				}
				usedApplyNames.add(applyKey);
				applyKeys.push(applyKey);

				const opObj = rule[applyKey];
				if (opObj === null || typeof opObj !== "object" || Array.isArray(opObj)) {
					throw new InsightError("APPLYRULE must be of form { applykey: { APPLYTOKEN: KEY } }");
				}
				const tokens = Object.keys(opObj);
				if (tokens.length !== 1) {
					throw new InsightError("APPLYRULE inner object must have exactly one APPLYTOKEN.");
				}
				const token = tokens[0];
				const fieldKey = opObj[token];
				if (typeof fieldKey !== "string" || !fieldKey.includes("_")) {
					throw new InsightError("APPLYRULE field must be a dataset key '<id>_<field>'.");
				}
				applyFieldKeys.push(fieldKey);
			}
		}

		return { hasTransformations: true, groupKeys: GROUP, applyKeys, applyFieldKeys };
	}

	collectDatasetIds(fieldKeys: Set<string>): Set<string> {
		const ids = new Set<string>();
		for (const k of fieldKeys) {
			const parts = k.split("_");
			if (parts.length !== 2 || !parts[0] || !parts[1]) {
				throw new InsightError(`Invalid key '${k}'. Must be of form '<id>_<field>'.`);
			}
			ids.add(parts[0]);
		}
		return ids;
	}

	validateColumnsWithTransformations(columns: string[], groupKeys: string[], applyKeys: string[]) {
		const colSet = new Set(columns);
		for (const c of columns) {
			if (typeof c !== "string") throw new InsightError("COLUMNS entries must be strings.");
			if (!c.includes("_")) {
				if (!applyKeys.includes(c)) {
					throw new InsightError(`COLUMNS key '${c}' must be a GROUP key or an applykey.`);
				}
			} else {
				if (!groupKeys.includes(c)) {
					throw new InsightError(`COLUMNS key '${c}' must be a GROUP key or an applykey.`);
				}
			}
		}
	}

	validateSingleFieldMapping(inner: any, ctx: string): string {
		if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
			throw new InsightError(`${ctx} must be an object with exactly one field key.`);
		}
		const ks = Object.keys(inner);
		if (ks.length !== 1) {
			throw new InsightError(`${ctx} must have exactly one field key.`);
		}
		return ks[0];
	}

	splitKey(k: string): { id: string; field: string } {
		if (typeof k !== "string") {
			throw new InsightError("Field key must be a string.");
		}
		const parts = k.split("_");
		if (parts.length !== 2 || !parts[0] || !parts[1]) {
			throw new InsightError(`Invalid field key '${k}'. Must be '<id>_<field>'.`);
		}
		return { id: parts[0], field: parts[1] };
	}
}
