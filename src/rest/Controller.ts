// src/rest/Controller.ts
import {
	IInsightFacade,
	InsightDatasetKind,
	InsightError,
	NotFoundError,
	ResultTooLargeError
} from "../controller/IInsightFacade";
import { Request, Response } from "express";

export class Controller {
	private facade: IInsightFacade;

	constructor(facade: IInsightFacade) {
		this.facade = facade;
	}

	// helper: same rules as InsightFacade.isValidId
	private isValidId(id: string | undefined): boolean {
		if (typeof id !== "string") {
			return false;
		}
		if (!id.trim()) {
			return false;
		}
		if (id.includes("_")) {
			return false;
		}
		return true;
	}

	// PUT /dataset/:id/:kind
	public addDataset = async (req: Request, res: Response): Promise<void> => {
		const idParam = req.params.id;
		const kindParam = req.params.kind;

		console.log(
			"addDataset request:",
			idParam,
			kindParam,
			"body length:",
			(req.body as Buffer | undefined)?.length ?? 0
		);

		// 1) Validate id according to the spec
		if (!this.isValidId(idParam)) {
			res.status(400).json({ error: "Invalid id" });
			return;
		}

		// 2) Validate kind
		let kind: InsightDatasetKind;
		if (kindParam === InsightDatasetKind.Sections) {
			kind = InsightDatasetKind.Sections;
		} else {
			res.status(400).json({ error: "Invalid dataset kind" });
			return;
		}

		// 3) Ensure we actually got a body (zip)
		if (!req.body || !(req.body instanceof Buffer) || (req.body as Buffer).length === 0) {
			res.status(400).json({ error: "Request body must contain a non-empty zip file." });
			return;
		}

		try {
			const content = (req.body as Buffer).toString("base64");
			const result = await this.facade.addDataset(idParam, content, kind);
			console.log("addDataset success:", idParam);
			res.status(200).json({ result });
		} catch (err) {
			console.error("addDataset error:", idParam, err);
			if (err instanceof InsightError) {
				res.status(400).json({ error: err.message });
			} else {
				res.status(400).json({ error: "Unknown error" });
			}
		}
	};

	// DELETE /dataset/:id
	public removeDataset = async (req: Request, res: Response): Promise<void> => {
		const id = req.params.id;

		try {
			const result = await this.facade.removeDataset(id);
			res.status(200).json({ result });
		} catch (err) {
			if (err instanceof NotFoundError) {
				res.status(404).json({ error: err.message });
			} else if (err instanceof InsightError) {
				res.status(400).json({ error: err.message });
			} else {
				res.status(400).json({ error: "Unknown error" });
			}
		}
	};

	// GET /datasets
	public listDatasets = async (_req: Request, res: Response): Promise<void> => {
		const result = await this.facade.listDatasets();
		res.status(200).json({ result });
	};

	// POST /query
	public performQuery = async (req: Request, res: Response): Promise<void> => {
		try {
			const result = await this.facade.performQuery(req.body);
			res.status(200).json({ result });
		} catch (err) {
			if (err instanceof ResultTooLargeError || err instanceof InsightError) {
				res.status(400).json({ error: err.message });
			} else {
				res.status(400).json({ error: "Unknown error" });
			}
		}
	};

	// GET /insights/:id?view=1|2|3
	public getInsight = async (req: Request, res: Response): Promise<void> => {
		const id = req.params.id;
		const view = Number(req.query.view || 1);

		try {
			let query: unknown;

			if (view === 1) {
				query = {
					WHERE: {},
					OPTIONS: {
						COLUMNS: [`${id}_dept`, "avgGrade"],
						ORDER: { dir: "DOWN", keys: ["avgGrade"] }
					},
					TRANSFORMATIONS: {
						GROUP: [`${id}_dept`],
						APPLY: [{ avgGrade: { AVG: `${id}_avg` } }]
					}
				};
			} else if (view === 2) {
				query = {
					WHERE: {},
					OPTIONS: {
						COLUMNS: [`${id}_id`, "countSections"],
						ORDER: { dir: "DOWN", keys: ["countSections"] }
					},
					TRANSFORMATIONS: {
						GROUP: [`${id}_id`],
						APPLY: [{ countSections: { COUNT: `${id}_uuid` } }]
					}
				};
			} else {
				query = {
					WHERE: {},
					OPTIONS: {
						COLUMNS: [`${id}_year`, "avgYearGrade"],
						ORDER: `${id}_year`
					},
					TRANSFORMATIONS: {
						GROUP: [`${id}_year`],
						APPLY: [{ avgYearGrade: { AVG: `${id}_avg` } }]
					}
				};
			}

			const results = await this.facade.performQuery(query);

			const labels = results.map((r) => String(Object.values(r)[0]));
			const values = results.map((r) => Number(Object.values(r)[1]));

			res.status(200).json({ labels, values });
		} catch (err) {
			if (err instanceof InsightError || err instanceof ResultTooLargeError) {
				res.status(400).json({ error: err.message });
			} else {
				res.status(400).json({ error: "Unknown error" });
			}
		}
	};
}
