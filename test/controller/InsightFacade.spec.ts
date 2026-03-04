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
		// This block runs once and loads the datasets.
		facade = new InsightFacade();
		sections = await getContentFromArchives("pair.zip");
		// Just in case there is anything hanging around from a previous run of the test suite
		await clearDisk();
	});

	describe("AddDataset", async function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should successfully add a dataset", async function () {
			const result = await facade.addDataset("a", sections, InsightDatasetKind.Sections);
			return expect(result).to.have.members(["a"]);
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
			await facade.addDataset("A", sections, InsightDatasetKind.Sections);
			await expect(facade.addDataset("A", sections, InsightDatasetKind.Sections)).to.be.rejectedWith(Error);
		});

		it("should reject when dataset content is empty", async function () {
			await expect(facade.addDataset("A", "", InsightDatasetKind.Sections)).to.be.rejectedWith(InsightError);
		});

		it("should reject with an empty dataset id", async function () {
			let e;
			try {
				e = await getContentFromArchives("empty.zip");
				await facade.addDataset("ubc", e, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset with invalid courses", async function () {
			let c;
			try {
				c = await getContentFromArchives("badCourse.zip");
				await facade.addDataset("ubc", c, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset with invalid course name", async function () {
			let cn;
			try {
				cn = await getContentFromArchives("badCourseName.zip");
				await facade.addDataset("ubc", cn, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset with invalid folder name", async function () {
			let fn;
			try {
				fn = await getContentFromArchives("badFolderName.zip");
				await facade.addDataset("folder", fn, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
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
	});
});
