// frontend/tests/frontend.integration.test.js

const fs = require("fs");
const path = require("path");
const { fireEvent } = require("@testing-library/dom");
require("@testing-library/jest-dom");

/**
 * Frontend integration tests:
 * US1: Add dataset – empty ID validation
 * US2: View datasets – table shows dataset IDs
 * US3: Remove dataset – row removed + status message
 * US4: View insights – clicking "View" opens modal and calls /insights
 */

describe("Sections Insights frontend integration", () => {
	beforeEach(() => {
		// Reset DOM + module cache + globals
		jest.resetModules();
		document.documentElement.innerHTML = "";
		global.fetch = undefined;
		global.confirm = undefined;
		global.Chart = undefined;
	});

	// US1 – Add dataset
	test('US1-frontend: shows an error when clicking "Add Dataset" with empty ID', async () => {
		const html = fs.readFileSync(
			path.join(__dirname, "../public/index.html"),
			"utf8"
		);
		document.documentElement.innerHTML = html;

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: [] }),
		});

		require("../public/main.js");

		const addBtn = document.getElementById("addBtn");
		const statusEl = document.getElementById("status");
		const datasetIdInput = document.getElementById("datasetId");

		expect(addBtn).not.toBeNull();
		expect(statusEl).not.toBeNull();
		expect(datasetIdInput).not.toBeNull();

		datasetIdInput.value = "";

		fireEvent.click(addBtn);
		await new Promise((r) => setTimeout(r, 0));

		expect(statusEl).toHaveTextContent("Please enter a dataset ID.");
		expect(statusEl).toHaveClass("status");
		expect(statusEl).toHaveClass("error");
	});

	// US2 – View datasets (frontend)
	test("US2-frontend: table shows dataset IDs from /datasets", async () => {
		const html = fs.readFileSync(
			path.join(__dirname, "../public/index.html"),
			"utf8"
		);
		document.documentElement.innerHTML = html;

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				result: [
					{ id: "sectionsA", kind: "sections", numRows: 100 },
					{ id: "sectionsB", kind: "sections", numRows: 50 },
				],
			}),
		});

		require("../public/main.js");

		// Wait for loadDatasets to finish
		await new Promise((r) => setTimeout(r, 0));

		const tbody = document.getElementById("datasetsBody");
		expect(tbody).not.toBeNull();

		const text = tbody.textContent;
		expect(text).toContain("sectionsA");
		expect(text).toContain("sectionsB");
	});

	// US3 – Remove dataset (frontend)
	test('US3-frontend: clicking "Remove" removes the row and shows success status', async () => {
		const html = fs.readFileSync(
			path.join(__dirname, "../public/index.html"),
			"utf8"
		);
		document.documentElement.innerHTML = html;


		global.fetch = jest
			.fn()
			// #1 GET /datasets (initial)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					result: [{ id: "sectionsX", kind: "sections", numRows: 42 }],
				}),
			})
			// #2 DELETE /dataset/sectionsX
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: "sectionsX" }),
			})
			// #3 GET /datasets (after removal)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: [] }),
			});

		// Confirm dialog should return true
		global.confirm = jest.fn(() => true);

		require("../public/main.js");
		await new Promise((r) => setTimeout(r, 0));

		const tbody = document.getElementById("datasetsBody");
		const statusEl = document.getElementById("status");
		expect(tbody).not.toBeNull();
		expect(statusEl).not.toBeNull();

		// There should be a "Remove" button for sectionsX
		const removeBtn = tbody.querySelector(".remove-btn");
		expect(removeBtn).not.toBeNull();

		fireEvent.click(removeBtn);
		await new Promise((r) => setTimeout(r, 0));

		// Status should show success
		expect(statusEl).toHaveTextContent("Dataset removed.");
		expect(statusEl).toHaveClass("status");
		expect(statusEl).toHaveClass("success");

		// Table should now show the "No datasets added yet" placeholder
		const bodyText = tbody.textContent;
		expect(bodyText).toContain("No datasets added yet. Upload a .zip and add a dataset to get started.");
	});

	// US4 – View insights (frontend)
	test('US4-frontend: clicking "View" opens modal and requests insight data', async () => {
		const html = fs.readFileSync(
			path.join(__dirname, "../public/index.html"),
			"utf8"
		);
		document.documentElement.innerHTML = html;

		global.Chart = jest.fn(() => ({
			destroy: jest.fn(),
		}));


		global.fetch = jest
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					result: [{ id: "sections1", kind: "sections", numRows: 123 }],
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					labels: ["CPSC", "MATH"],
					values: [80, 75],
				}),
			});

		require("../public/main.js");
		await new Promise((r) => setTimeout(r, 0));

		const tbody = document.getElementById("datasetsBody");
		const modalBackdrop = document.getElementById("modalBackdrop");
		const modalTitle = document.getElementById("modalTitle");
		const canvas = document.getElementById("insightChart");

		canvas.getContext = jest.fn(() => ({}));

		expect(tbody).not.toBeNull();
		expect(modalBackdrop).not.toBeNull();
		expect(modalTitle).not.toBeNull();

		const firstViewBtn = tbody.querySelector(".view-btn");
		expect(firstViewBtn).not.toBeNull();

		// Click "View" for view 1
		fireEvent.click(firstViewBtn);
		await new Promise((r) => setTimeout(r, 0));

		// Modal should be visible
		expect(modalBackdrop.style.display).toBe("flex");
		expect(modalTitle.textContent).toContain('Dataset "sections1" – View 1');

		// And fetch should have been called for the insights endpoint
		expect(global.fetch).toHaveBeenCalledTimes(2);
		const secondCallUrl = global.fetch.mock.calls[1][0];
		expect(String(secondCallUrl)).toContain("/insights/sections1?view=1");
	});
});
