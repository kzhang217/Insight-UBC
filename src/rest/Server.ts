import express, { Express } from "express";
import cors from "cors";
import { Controller } from "./Controller";
import InsightFacade from "../controller/InsightFacade";

export default class Server {
	private app: Express;
	private port: number;
	private controller: Controller;

	constructor(port: number) {
		this.port = port;
		this.app = express();
		this.controller = new Controller(new InsightFacade());
		this.configureMiddleware();
		this.registerRoutes();
	}

	private configureMiddleware() {
		// 先 json，再 raw（照 spec 要求）
		this.app.use(express.json());
		this.app.use(express.raw({ type: "application/*", limit: "10mb" }));
		this.app.use(cors());
	}

	private registerRoutes() {
		this.app.put("/dataset/:id/:kind", this.controller.addDataset);
		this.app.delete("/dataset/:id", this.controller.removeDataset);
		this.app.get("/datasets", this.controller.listDatasets);
		this.app.post("/query", this.controller.performQuery);
		this.app.get("/insights/:id", this.controller.getInsight);
	}

	public start(): Promise<void> {
		return new Promise((resolve) => {
			this.app.listen(this.port, () => {
				// 这里可以用 Log，也可以先 console.log
				console.log(`Server listening on port ${this.port}`);
				resolve();
			});
		});
	}
}
