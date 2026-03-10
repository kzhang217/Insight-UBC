import {
	IInsightFacade,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
} from "../../src/controller/IInsightFacade";
import InsightFacade from "../../src/controller/InsightFacade";
import { clearDisk, getContentFromArchives, loadTestQuery } from "../TestUtil";

import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";

use(chaiAsPromised);

export interface ITestQuery {
	title?: string;
	input: unknown;
	errorExpected: boolean;
	expected: any;
}

describe("InsightFacade", function () {
	let facade: IInsightFacade;

	// Declare datasets used in tests. You should add more datasets like this!
	let sections: string;

	before(async function () {
		await clearDisk(); // ① 先清理
		facade = new InsightFacade(); // ② 再创建实例（如果构造里会 loadDatasets，会读到“空”）
		sections = await getContentFromArchives("pair.zip");
	});

	describe("AddDataset", async function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should successfully add a dataset", async function () {
			const result = await facade.addDataset("pair", sections, InsightDatasetKind.Sections);
			return expect(result).to.have.members(["pair"]);
		});

		it("should reject with  an empty dataset id", async function () {
			// Read the "Free Mutant Walkthrough" in the spec for tips on how to get started!
			await expect(facade.addDataset("", sections, InsightDatasetKind.Sections)).to.be.rejectedWith(InsightError);
		});

		it("should reject with  an space dataset id", async function () {
			// Read the "Free Mutant Walkthrough" in the spec for tips on how to get started!
			await expect(facade.addDataset("  ", sections, InsightDatasetKind.Sections)).to.be.rejectedWith(InsightError);
		});

		it("should reject with  an Underline dataset id", async function () {
			// Read the "Free Mutant Walkthrough" in the spec for tips on how to get started!
			await expect(facade.addDataset("A_B", sections, InsightDatasetKind.Sections)).to.be.rejectedWith(InsightError);
		});

		it("rejects non-Sections kind in c0/c1", async () => {
			await expect(facade.addDataset("x", sections, InsightDatasetKind.Rooms)).to.be.rejectedWith(InsightError);
		});

		it("should reject with  add same dataset id", async function () {
			// Read the "Free Mutant Walkthrough" in the spec for tips on how to get started!
			await facade.addDataset("pair", sections, InsightDatasetKind.Sections);
			await expect(facade.addDataset("pair", sections, InsightDatasetKind.Sections)).to.be.rejectedWith(Error);
		});

		it("should reject when dataset content is empty", async function () {
			await expect(facade.addDataset("A", "", InsightDatasetKind.Sections)).to.be.rejectedWith(InsightError);
		});

		it("should reject with an empty dataset id", async function () {
			let empty;
			try {
				empty = await getContentFromArchives("empty.zip");
				await facade.addDataset("ubc", empty, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset with invalid courses", async function () {
			let course;
			try {
				course = await getContentFromArchives("badCourse.zip");
				await facade.addDataset("ubc", course, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset with invalid course name", async function () {
			let courseName;
			try {
				courseName = await getContentFromArchives("badCourseName.zip");
				await facade.addDataset("ubc", courseName, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset with invalid folder name", async function () {
			let folderName;
			try {
				folderName = await getContentFromArchives("badFolderName.zip");
				await facade.addDataset("folder", folderName, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("fail to add empty dataset", async function () {
			try {
				await facade.addDataset("", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});
	});

	describe("addRoomDataset", function () {
		let rooms: string;
		let facade: InsightFacade;

		before(async function () {
			rooms = await getContentFromArchives("campus.zip");
		});

		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		describe("Checking for valid Content argument to addRoomDataset", function () {
			it("should reject with an invalid Dataset that is not structured as a base64 string of a zip file", async function () {
				const result = facade.addDataset("cpsc", "not_a_base_64_string_of_a zip_file", InsightDatasetKind.Rooms);
				const result2 = facade.listDatasets();

				return (
					(await expect(result).to.eventually.be.rejectedWith(InsightError)) &&
					expect(result2).to.eventually.deep.equal([])
				);
			});

			it("should reject with an invalid Dataset that is not in the form of a serialized zip file", async function () {
				const result = facade.addDataset(
					"invalid",
					await getContentFromArchives("invalid_non_zip.json"),
					InsightDatasetKind.Rooms
				);
				const result2 = facade.listDatasets();

				return (
					(await expect(result).to.eventually.be.rejectedWith(InsightError)) &&
					expect(result2).to.eventually.deep.equal([])
				);
			});

			it("should reject with an invalid Dataset that is empty which contains no valid rooms", async function () {
				const result = facade.addDataset(
					"invalid",
					await getContentFromArchives("invalid_empty_2.zip"),
					InsightDatasetKind.Rooms
				);
				const result2 = facade.listDatasets();

				return (
					(await expect(result).to.eventually.be.rejectedWith(InsightError)) &&
					expect(result2).to.eventually.deep.equal([])
				);
			});

			it("should reject with an invalid Dataset contains a building without rooms", async function () {
				const result = facade.addDataset(
					"invalid",
					await getContentFromArchives("invalid_no_rooms.zip"),
					InsightDatasetKind.Rooms
				);
				const result2 = facade.listDatasets();

				return (
					(await expect(result).to.eventually.be.rejectedWith(InsightError)) &&
					expect(result2).to.eventually.deep.equal([])
				);
			});

			it("should reject with an invalid Dataset contains an invalid room missing field 'seats'", async function () {
				const result = facade.addDataset(
					"invalid",
					await getContentFromArchives("invalid_missing_field_2.zip"),
					InsightDatasetKind.Rooms
				);
				const result2 = facade.listDatasets();

				return (
					(await expect(result).to.eventually.be.rejectedWith(InsightError)) &&
					expect(result2).to.eventually.deep.equal([])
				);
			});

			it("should reject when the requested room's geolocation request failed to return", async function () {
				const result = facade.addDataset(
					"invalid",
					await getContentFromArchives("invalid_unexist_room_location.zip"),
					InsightDatasetKind.Rooms
				);
				const result2 = facade.listDatasets();

				return (
					(await expect(result).to.eventually.be.rejectedWith(InsightError)) &&
					expect(result2).to.eventually.deep.equal([])
				);
			});
		});

		describe("Checking for successful addRoomDataset", function () {
			it("should successfully add a room dataset (first)", function () {
				const result = facade.addDataset("campus", rooms, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.have.members(["campus"]);
			});

			it("should successfully add a section dataset (second)", function () {
				const result = facade.addDataset("campus", rooms, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.have.members(["campus"]);
			});
		});

		it("rejects duplicate id", async () => {
			await expect(facade.addDataset("campus", rooms, InsightDatasetKind.Rooms)).to.be.fulfilled;
			await expect(facade.addDataset("campus", rooms, InsightDatasetKind.Rooms)).to.be.rejectedWith(InsightError);
		});

		it("rejects when index.htm missing at root", async () => {
			const bad = await getContentFromArchives("invalid_missing_index.zip");
			await expect(facade.addDataset("x", bad, InsightDatasetKind.Rooms)).to.be.rejectedWith(InsightError);
		});

		it("skips broken building links but succeeds if others have rooms", async () => {
			const z = await getContentFromArchives("rooms_some_broken_links.zip");
			await expect(facade.addDataset("ok", z, InsightDatasetKind.Rooms)).to.be.fulfilled;
			const list = await facade.listDatasets();
			const camp = list.find((d) => d.id === "ok")!;
			expect(camp.numRows).to.be.greaterThan(0);
		});

		it("rejects when all geocodes fail for buildings that have rooms", async () => {
			const z = await getContentFromArchives("rooms_all_geocode_fail.zip");
			await expect(facade.addDataset("geo_fail", z, InsightDatasetKind.Rooms)).to.be.rejectedWith(InsightError);
		});

		it("persists to disk and loads on a new instance", async () => {
			await expect(facade.addDataset("campus", rooms, InsightDatasetKind.Rooms)).to.be.fulfilled;
			const f2 = new InsightFacade();
			const list2 = await f2.listDatasets();
			expect(list2.map((d) => d.id)).to.include("campus");
		});
	});

	describe("RemoveDataset", async function () {
		it("should reject when removing dataset with empty id", async function () {
			await expect(facade.removeDataset("")).to.be.rejectedWith(InsightError);
		});
		it("should reject when removing dataset with whitespace id", async function () {
			await expect(facade.removeDataset("   ")).to.be.rejectedWith(InsightError);
		});

		it("should reject when removing dataset with underscore id", async function () {
			await expect(facade.removeDataset("bad_id")).to.be.rejectedWith(InsightError);
		});

		it("should reject when removing a dataset that does not exist", async function () {
			await expect(facade.removeDataset("nope")).to.be.rejectedWith(NotFoundError);
		});

		it("should succeed when removing an existing dataset", async function () {
			await facade.addDataset("sections", sections, InsightDatasetKind.Sections);
			const removedId = await facade.removeDataset("sections");
			expect(removedId).to.equal("sections");
		});

		it("adds a valid sections dataset and lists correct metadata", async () => {
			const id = "ok_add_1";

			const ids = await facade.addDataset(id, sections, InsightDatasetKind.Sections);
			expect(ids).to.include(id);

			const listed = await facade.listDatasets();
			const meta = listed.find((d) => d.id === id);
			expect(meta).to.exist;
			expect(meta!.kind).to.equal(InsightDatasetKind.Sections);
			expect(meta!.numRows).to.be.greaterThan(0); // 如知道确切行数也可用 equal
		});
	});

	describe("ListDatasets", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("lists correct metadata and reflects removal", async function () {
			await facade.addDataset("L1", sections, InsightDatasetKind.Sections);
			const list1 = await facade.listDatasets();
			const meta = list1.find((x) => x.id === "L1");
			expect(meta).to.exist;
			expect(meta!.kind).to.equal(InsightDatasetKind.Sections);
			expect(meta!.numRows).to.be.greaterThan(0);
			await facade.removeDataset("L1");
			const list2 = await facade.listDatasets();
			expect(list2.map((m) => m.id)).to.not.include("L1");
			await expect(facade.addDataset("L1", sections, InsightDatasetKind.Sections)).to.eventually.include("L1");
		});
	});

	describe("performQuery", function () {
		/**
		 * Loads the TestQuery specified in the test name and asserts the behaviour of performQuery.
		 *
		 * Note: the 'this' parameter is automatically set by Mocha and contains information about the test.
		 */
		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error(
					"Invalid call to checkQuery." +
						"Usage: 'checkQuery' must be passed as the second parameter of Mocha's it(..) function." +
						"Do not invoke the function directly."
				);
			}
			// Destructuring assignment to reduce property accesses
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			let result: InsightResult[] = []; // dummy value before being reassigned
			try {
				result = await facade.performQuery(input);
			} catch (err: any) {
				if (!errorExpected) {
					expect.fail(`performQuery threw unexpected error: ${err}`);
				}
				// TODO: replace this failing assertion with your assertions. You will need to reason about the code in this function
				// to determine what to put here :)
				const name = err?.constructor?.name ?? err?.name ?? "Error";
				expect(name).to.equal(expected);
				return;
			}
			if (errorExpected) {
				expect.fail(`performQuery resolved when it should have rejected with ${expected}`);
			}
			// TODO: replace this failing assertion with your assertions. You will need to reason about the code in this function
			// to determine what to put here :)
			expect(result).to.be.an("array");
			expect(result).to.deep.equal(expected);
			return;
		}

		before(async function () {
			facade = new InsightFacade();

			// Add the datasets to InsightFacade once.
			// Will *fail* if there is a problem reading ANY dataset.
			const loadDatasetPromises: Promise<string[]>[] = [
				facade.addDataset("sections", sections, InsightDatasetKind.Sections),
				facade.addDataset("rooms", await getContentFromArchives("campus.zip"), InsightDatasetKind.Rooms),
			];

			try {
				await Promise.all(loadDatasetPromises);
			} catch (err) {
				throw new Error(`In PerformQuery Before hook, dataset(s) failed to be added. \n${err}`);
			}
		});

		after(async function () {
			await clearDisk();
		});

		// Examples demonstrating how to test performQuery using the JSON Test Queries.
		// The relative path to the query file must be given in square brackets.
		it("[valid/simple.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[valid/isContains.json] IS contains wildcard.json", checkQuery);
		it("[valid/isPrefix.json] IS prefix wildcard.json", checkQuery);
		it("[valid/isSuffix.json] IS suffix wildcard.json", checkQuery);
		it("[invalid/invalid.json] Query missing WHERE", checkQuery);
		it("[invalid/noOptions.json] OPTIONS absent.json", checkQuery);
		it("[invalid/noColumns.json] COLUMNS absent.json", checkQuery);
		it("[invalid/emptyColumn.json] COLUMNS blank.json", checkQuery);
		it("[invalid/invalidColumn.json] COLUMNS not valid.json", checkQuery);
		it("[invalid/wrongOrder.json] ORDER incorrect.json", checkQuery);
		it("[invalid/multiDatasets.json] multiple dataset refs.json", checkQuery);
		it("[invalid/oversizedResults.json] oversized results.json", checkQuery);
		it("[invalid/isMiddle.json] IS middle asterisk illegal.json", checkQuery);

		it("[invalid/invalidUnknownDataset.json] Unknown dataset id", checkQuery);
		it("[invalid/invalidMissingPrefix.json] Missing dataset prefix", checkQuery);
		it("[invalid/invalidWhereNotObject.json] WHERE is not an object", checkQuery);
		it("[invalid/invalidAndNotArray.json] AND not array", checkQuery);
		it("[invalid/invalidGTOnStringField.json] GT on string field", checkQuery);
		it("[invalid/invalidISValueNotString.json] IS value not string", checkQuery);
		it("[invalid/invalidISMultipleStars.json] IS multiple stars", checkQuery);
		it("[invalid/invalidOrderNotInColumns.json] ORDER not in COLUMNS", checkQuery);

		it("[valid/validGT.json] avg > 80", checkQuery);
		it("[valid/validLT.json] avg < 50", checkQuery);
		it("[valid/validBetween.json] avg between 60 and 90", checkQuery);
		it("[invalid/andEmpty.json] AND with empty filter", checkQuery);
		it("[invalid/orEmpty.json] OR with empty filter", checkQuery);
		it("[invalid/invalidContradict.json] GT avg > 60 AND LT avg < 50 impossible", checkQuery);

		it("[invalid/contradictGT_LT.json] GT > 90 AND LT < 60 impossible", checkQuery);
		it("[invalid/contradictEQ_GT.json] EQ 2015 AND GT 2020 impossible", checkQuery);
		it("[invalid/contradictEQ_LT.json] EQ 2015 AND LT 2010 impossible", checkQuery);
		it("[invalid/contradictISPrefixSuffix.json] IS prefix cpsc* AND IS prefix math*", checkQuery);
		it("[invalid/contradictISAndNot.json] IS title = intro AND NOT IS title = intro", checkQuery);
		it("[invalid/contradictORImpossible.json] OR avg > 200 OR avg < -50 impossible", checkQuery);
		it("[invalid/contradictNOT.json] NOT GT 70 AND GT 80 impossible", checkQuery);

		it("ORDER object DOWN on string key (exercise string compare path with DOWN)", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_instructor"],
					ORDER: { dir: "DOWN", keys: ["sections_instructor"] },
				},
			};
			const res = await facade.performQuery(q);
			expect(res.length).to.be.greaterThan(0);
			for (let i = 1; i < res.length; i++) {
				const prev = String(res[i - 1]["sections_instructor"]);
				const cur = String(res[i]["sections_instructor"]);
				expect(prev.localeCompare(cur) >= 0).to.equal(true);
			}
		});

		it("CourseQueries: filter WHERE EQ on sections_year = 1900 returns only 'overall' rows", async () => {
			const q = {
				WHERE: { EQ: { sections_year: 1900 } },
				OPTIONS: { COLUMNS: ["sections_year", "sections_title", "sections_uuid"] },
			};
			const res = await facade.performQuery(q);
			expect(res.length).to.be.greaterThan(0);
			for (const r of res) {
				expect(r["sections_year"]).to.equal(1900);
			}
		});

		it("Avg: AVG is computed with Decimal and rounded to 2 dp (C2 rules)", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_title", "overallAvg"],
					ORDER: { dir: "DOWN", keys: ["overallAvg", "sections_title"] },
				},
				TRANSFORMATIONS: {
					GROUP: ["sections_title"],
					APPLY: [{ overallAvg: { AVG: "sections_avg" } }],
				},
			};
			const res = await facade.performQuery(q);
			expect(res.length).to.be.greaterThan(0);
			for (const r of res) {
				const v = r["overallAvg"];
				expect(typeof v).to.equal("number");
				expect(Number.isInteger((v as number) * 100)).to.equal(true);
			}
		});

		it("C1: ORDER without underscore (no TRANSFORMATIONS) should reject clearly", async () => {
			const q = {
				WHERE: {},
				OPTIONS: { COLUMNS: ["sections_dept"], ORDER: "dept" }, // missing dataset prefix
			};
			await expect(facade.performQuery(q)).to.be.rejectedWith(InsightError);
		});

		it("C1: columns must have dataset prefix when no TRANSFORMATIONS", async () => {
			const q = {
				WHERE: {},
				OPTIONS: { COLUMNS: ["dept"] }, // invalid in C1
			};
			await expect(facade.performQuery(q)).to.be.rejectedWith(InsightError);
		});
	});

	//------------------------------------------C2-------------------------------

	describe("C2 targeted tests — RoomQueries, Geolocation, Max, Avg, Sorting", function () {
		let facade: IInsightFacade;

		before(async function () {
			facade = new InsightFacade();
			await facade.addDataset("sections", await getContentFromArchives("pair.zip"), InsightDatasetKind.Sections);
			await facade.addDataset("rooms", await getContentFromArchives("campus.zip"), InsightDatasetKind.Rooms);
		});

		after(async function () {
			await clearDisk();
		});

		// ------------------------------ RoomQueries ------------------------------

		it("RoomQueries: furniture contains *Tables* & seats > 300; GROUP shortname; MAX seats; ORDER DESC by applykey", async () => {
			const q = {
				WHERE: {
					AND: [{ IS: { rooms_furniture: "*Tables*" } }, { GT: { rooms_seats: 300 } }],
				},
				OPTIONS: {
					COLUMNS: ["rooms_shortname", "maxSeats"],
					ORDER: { dir: "DOWN", keys: ["maxSeats"] },
				},
				TRANSFORMATIONS: {
					GROUP: ["rooms_shortname"],
					APPLY: [{ maxSeats: { MAX: "rooms_seats" } }],
				},
			};
			const res = await facade.performQuery(q);
			expect(res).to.be.an("array");
			expect(res.length).to.be.greaterThan(0);
			// Strictly non-increasing by maxSeats
			for (let i = 1; i < res.length; i++) {
				expect(res[i - 1]["maxSeats"] >= res[i]["maxSeats"]).to.equal(true);
			}
		});

		it("RoomQueries: COUNT unique room numbers per building; SUM seats rounding; ORDER UP by rooms_shortname", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["rooms_shortname", "roomCount", "sumSeats"],
					ORDER: { dir: "UP", keys: ["rooms_shortname"] },
				},
				TRANSFORMATIONS: {
					GROUP: ["rooms_shortname"],
					APPLY: [{ roomCount: { COUNT: "rooms_number" } }, { sumSeats: { SUM: "rooms_seats" } }],
				},
			};
			const res = await facade.performQuery(q);
			expect(res).to.be.an("array");
			expect(res.length).to.be.greaterThan(0);
			// Types + monotonic non-decreasing string order using < semantics
			for (let i = 0; i < res.length; i++) {
				expect(res[i].roomCount).to.be.a("number");
				expect(res[i].sumSeats).to.be.a("number");
				if (i > 0) {
					const prev = String(res[i - 1]["rooms_shortname"]);
					const cur = String(res[i]["rooms_shortname"]);
					expect(prev <= cur).to.equal(true);
				}
			}
		});

		// ------------------------------ Geolocation ------------------------------

		it("Geolocation: addDataset succeeds when some buildings/geocodes fail but others succeed", async () => {
			const f = new InsightFacade();
			const z = await getContentFromArchives("rooms_some_broken_links.zip");
			await expect(f.addDataset("rok", z, InsightDatasetKind.Rooms)).to.be.fulfilled;
			const list = await f.listDatasets();
			const meta = list.find((d) => d.id === "rok");
			expect(meta).to.exist;
			expect(meta!.numRows).to.be.greaterThan(0);
		});

		it("Geolocation: addDataset rejects when all geocodes fail despite HTML rooms present", async () => {
			const f = new InsightFacade();
			const z = await getContentFromArchives("rooms_all_geocode_fail.zip");
			await expect(f.addDataset("r_bad", z, InsightDatasetKind.Rooms)).to.be.rejectedWith(InsightError);
		});

		// ------------------------------ Max (numeric) ------------------------------

		it("Max: per-building MAX seats equals the top seats if we sort that building's rooms (sanity check on first 3)", async () => {
			// 1) Get per-building max seats
			const maxQuery = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["rooms_shortname", "maxSeats"],
					ORDER: { dir: "DOWN", keys: ["maxSeats", "rooms_shortname"] },
				},
				TRANSFORMATIONS: {
					GROUP: ["rooms_shortname"],
					APPLY: [{ maxSeats: { MAX: "rooms_seats" } }],
				},
			};
			const grouped = await facade.performQuery(maxQuery);
			expect(grouped.length).to.be.greaterThan(0);

			// 2) For first up-to-3 buildings, fetch that building's rooms sorted by seats desc and compare
			const sampleCount = Math.min(3, grouped.length);
			for (let i = 0; i < sampleCount; i++) {
				const b = grouped[i]["rooms_shortname"] as string;
				const refMax = grouped[i]["maxSeats"] as number;

				const perBuilding = {
					WHERE: { IS: { rooms_shortname: b } },
					OPTIONS: {
						COLUMNS: ["rooms_shortname", "rooms_seats"],
						ORDER: { dir: "DOWN", keys: ["rooms_seats"] },
					},
				};
				const rows = await facade.performQuery(perBuilding);
				expect(rows.length).to.be.greaterThan(0);
				const top = rows[0]["rooms_seats"] as number;
				expect(top).to.equal(refMax);
			}
		});

		// ------------------------------ Avg (Decimal + 2dp) ------------------------------

		it("Avg: AVG is computed with Decimal and rounded to 2 dp (C2 rules)", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_title", "overallAvg"],
					ORDER: { dir: "DOWN", keys: ["overallAvg", "sections_title"] },
				},
				TRANSFORMATIONS: {
					GROUP: ["sections_title"],
					APPLY: [{ overallAvg: { AVG: "sections_avg" } }],
				},
			};
			const res = await facade.performQuery(q);
			expect(res.length).to.be.greaterThan(0);
			// Check two-decimal rounding by verifying *100 is integer
			for (const r of res) {
				const v = r["overallAvg"];
				expect(typeof v).to.equal("number");
				expect(Number.isInteger((v as number) * 100)).to.equal(true);
			}
		});

		// ------------------------------ Sorting (< semantics, multi-key, applykeys) ------------------------------

		it("Sorting: ORDER single string key DOWN (uses < semantics, not localeCompare)", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_instructor"],
					ORDER: { dir: "DOWN", keys: ["sections_instructor"] },
				},
			};
			const res = await facade.performQuery(q);
			expect(res.length).to.be.greaterThan(0);
			for (let i = 1; i < res.length; i++) {
				const prev = String(res[i - 1]["sections_instructor"]);
				const cur = String(res[i]["sections_instructor"]);
				expect(prev >= cur).to.equal(true);
			}
		});

		it("Sorting: ORDER multi-key with applykey first, then dataset key tie-breaker", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_dept", "avg2"],
					ORDER: { dir: "UP", keys: ["avg2", "sections_dept"] },
				},
				TRANSFORMATIONS: {
					GROUP: ["sections_dept"],
					APPLY: [{ avg2: { AVG: "sections_avg" } }],
				},
			};
			const res = await facade.performQuery(q);
			expect(res.length).to.be.greaterThan(0);
			for (let i = 1; i < res.length; i++) {
				const p = res[i - 1];
				const c = res[i];
				if (p["avg2"] === c["avg2"]) {
					// tie-break on sections_dept ascending
					expect(String(p["sections_dept"]) <= String(c["sections_dept"])).to.equal(true);
				} else {
					expect((p["avg2"] as number) <= (c["avg2"] as number)).to.equal(true);
				}
			}
		});

		it("Sorting: ORDER key must be in COLUMNS (applykey case)", async () => {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_dept", "xavg"],
					ORDER: { dir: "DOWN", keys: ["sections_avg"] }, // not in COLUMNS
				},
				TRANSFORMATIONS: {
					GROUP: ["sections_dept"],
					APPLY: [{ xavg: { AVG: "sections_avg" } }],
				},
			};
			await expect(facade.performQuery(q)).to.be.rejectedWith(InsightError);
		});
	});
});
