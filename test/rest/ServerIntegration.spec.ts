// test/rest/ServerIntegration.spec.ts
import "mocha";
import { expect } from "chai";
import supertest from "supertest";
import fs from "fs-extra";
import path from "path";
import Server from "../../src/rest/Server";

/**
 * Backend REST integration tests
 * US1: Add dataset (valid + invalid ID)
 * US2: List datasets (see IDs)
 * US3: Remove dataset
 * US4: Insights endpoint
 */

describe("Server REST integration", function () {
	this.timeout(10000);

	let server: Server;
	let request: any;

	const PAIR_ZIP_PATH = path.join(__dirname, "../resources/archives/pair.zip");

	before(async () => {
		// Clean data dir
		const dataDir = path.join(__dirname, "../../data");
		await fs.remove(dataDir);

		server = new Server(4321);
		await server.start();
		request = supertest("http://localhost:4321");
	});

	// US1 – Add dataset

	it("", async () => {
		const buf = await fs.readFile(PAIR_ZIP_PATH);

		const res = await request
			.put("/dataset/sections1/sections")
			.set("Content-Type", "application/x-zip-compressed")
			.send(buf);

		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("result");
		expect(res.body.result).to.be.an("array");
		expect(res.body.result).to.include("sections1");
	});

	it("US1-backend: rejects adding a dataset with invalid id (contains underscore)", async () => {
		const buf = await fs.readFile(PAIR_ZIP_PATH);

		const res = await request
			.put("/dataset/bad_id/sections")
			.set("Content-Type", "application/x-zip-compressed")
			.send(buf);

		expect(res.status).to.equal(400);
		expect(res.body).to.have.property("error");
		expect(res.body.error).to.match(/invalid id/i);
	});

	// US2 – View datasets

	it("US2-backend: lists added datasets with their IDs", async () => {
		// sections1 was added in the US1 test
		const res = await request.get("/datasets");

		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("result");

		const datasets = res.body.result as Array<{ id: string; kind: string; numRows: number }>;
		expect(datasets).to.be.an("array").that.is.not.empty;

		const ids = datasets.map((d) => d.id);
		expect(ids).to.include("sections1");
	});

	// US3 – Remove dataset

	it("US3-backend: removes an added dataset", async () => {
		// Ensure exists
		const buf = await fs.readFile(PAIR_ZIP_PATH);
		await request
			.put("/dataset/sectionsToRemove/sections")
			.set("Content-Type", "application/x-zip-compressed")
			.send(buf);

		const delRes = await request.delete("/dataset/sectionsToRemove");
		expect(delRes.status).to.equal(200);
		expect(delRes.body).to.have.property("result", "sectionsToRemove");

		const listRes = await request.get("/datasets");
		expect(listRes.status).to.equal(200);
		const datasets = listRes.body.result as Array<{ id: string }>;
		const ids = datasets.map((d) => d.id);
		expect(ids).to.not.include("sectionsToRemove");
	});

	// US4 – Insights

	it("US4-backend: returns labels and values for insights view 1", async () => {
		// Make sure sections1 exists (if tests run out of order)
		const sectionsPath = path.join(__dirname, "../../data/sections1.json");
		if (!(await fs.pathExists(sectionsPath))) {
			const buf = await fs.readFile(PAIR_ZIP_PATH);
			await request
				.put("/dataset/sections1/sections")
				.set("Content-Type", "application/x-zip-compressed")
				.send(buf);
		}

		const res = await request.get("/insights/sections1?view=1");
		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("labels");
		expect(res.body).to.have.property("values");

		const labels = res.body.labels as string[];
		const values = res.body.values as number[];

		expect(labels).to.be.an("array").that.is.not.empty;
		expect(values).to.be.an("array").that.is.not.empty;
		expect(labels.length).to.equal(values.length);
	});
});
