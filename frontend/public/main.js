
const API_BASE = "http://localhost:4321"; // 你的后端 Server.ts 监听的地址


const statusEl = document.getElementById("status");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const datasetIdInput = document.getElementById("datasetId");
const addBtn = document.getElementById("addBtn");
const datasetsBody = document.getElementById("datasetsBody");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalClose = document.getElementById("modalClose");
const insightCanvas = document.getElementById("insightChart");

let selectedFile = null;
let currentChart = null;


function setStatus(msg, type = "") {
	statusEl.textContent = msg || "";
	statusEl.className = "status " + (type ? type : "");
}


dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
	const file = e.target.files[0];
	if (file) {
		handleFile(file);
	}
});

dropzone.addEventListener("dragover", (e) => {
	e.preventDefault();
	dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
	dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
	e.preventDefault();
	dropzone.classList.remove("dragover");
	const file = e.dataTransfer.files[0];
	if (file) {
		handleFile(file);
	}
});

function handleFile(file) {
	if (!file.name.toLowerCase().endsWith(".zip")) {
		setStatus("Please select a .zip file.", "error");
		selectedFile = null;
		fileNameEl.textContent = "";
		return;
	}
	selectedFile = file;
	fileNameEl.textContent = "Selected file: " + file.name;
	setStatus("");
}

// ===== Add dataset =====
addBtn.addEventListener("click", async () => {
	const id = datasetIdInput.value.trim();
	const file = selectedFile;

	// 1) Frontend ID validation (same rules as backend)
	if (!id) {
		setStatus("Please enter a dataset ID.", "error");
		return;
	}
	if (id.includes("_")) {
		setStatus("Dataset ID cannot contain underscore (_).", "error");
		return;
	}
	// Optionally, you can enforce only non-whitespace here too, but trim() already did that.

	// 2) Ensure a file is selected
	if (!file) {
		setStatus("Please select a .zip file before adding the dataset.", "error");
		return;
	}

	try {
		const buf = await file.arrayBuffer();

		const res = await fetch(`${API_BASE}/dataset/${encodeURIComponent(id)}/sections`, {
			method: "PUT",
			headers: { "Content-Type": "application/x-zip-compressed" },
			body: buf
		});

		const json = await res.json();

		if (!res.ok) {
			console.error("Add dataset error:", json);
			setStatus(json.error || "Failed to add dataset.", "error");
			return; // ⚠️ do not continue on error
		}

		setStatus("Dataset added successfully.", "success");

		// Clear input state so user knows it's done
		datasetIdInput.value = "";
		selectedFile = null;
		fileNameEl.textContent = "";

		await loadDatasets();
	} catch (err) {
		console.error("Network or file error while adding dataset:", err);
		setStatus("Network or file error while adding dataset.", "error");
	}
});



async function loadDatasets() {
	try {
		const res = await fetch(`${API_BASE}/datasets`);
		const json = await res.json();
		const datasets = json.result || [];

		datasetsBody.innerHTML = "";

		datasets.forEach((ds) => {
			const id = ds.id;

			const tr = document.createElement("tr");

			// ID
			const idTd = document.createElement("td");
			idTd.textContent = id;
			tr.appendChild(idTd);


			[1, 2, 3].forEach((viewNum) => {
				const td = document.createElement("td");
				td.className = "actions";
				const btn = document.createElement("button");
				btn.textContent = "View";
				btn.className = "view-btn";
				btn.addEventListener("click", () => onViewClick(id, viewNum));
				td.appendChild(btn);
				tr.appendChild(td);
			});

			// Remove
			const removeTd = document.createElement("td");
			removeTd.className = "actions";
			const removeBtn = document.createElement("button");
			removeBtn.textContent = "Remove";
			removeBtn.className = "remove-btn";
			removeBtn.addEventListener("click", () => onRemoveClick(id));
			removeTd.appendChild(removeBtn);
			tr.appendChild(removeTd);

			datasetsBody.appendChild(tr);
		});

		if (datasets.length === 0) {
			const tr = document.createElement("tr");
			const td = document.createElement("td");
			td.colSpan = 5;
			td.style.color = "#6b7280";
			td.textContent = "No datasets added yet. Upload a .zip and add a dataset to get started.";
			tr.appendChild(td);
			datasetsBody.appendChild(tr);
		}
	} catch (err) {
		console.error(err);
		setStatus("Failed to load datasets list.", "error");
	}
}

async function onRemoveClick(id) {
	if (!confirm(`Are you sure you want to remove dataset "${id}"?`)) {
		return;
	}

	try {
		const res = await fetch(`${API_BASE}/dataset/${encodeURIComponent(id)}`, {
			method: "DELETE"
		});
		const json = await res.json();
		if (!res.ok) {
			setStatus(json.error || "Failed to remove dataset.", "error");
			return;
		}
		setStatus("Dataset removed.", "success");
		await loadDatasets();
	} catch (err) {
		console.error(err);
		setStatus("Network error while removing dataset.", "error");
	}
}

async function onViewClick(id, viewNum) {
	modalTitle.textContent = `Dataset "${id}" – View ${viewNum}`;
	openModal();

	try {
		const res = await fetch(`${API_BASE}/insights/${encodeURIComponent(id)}?view=${viewNum}`);
		const json = await res.json();

		if (!res.ok) {
			setStatus(json.error || "Failed to load insight data.", "error");
			return;
		}

		const { labels, values } = json;
		renderChart(labels, values, viewNum);
	} catch (e) {
		console.error(e);
		setStatus("Network error while loading insight data.", "error");
	}
}


function buildFakeInsightData(id, viewNum) {
	if (viewNum === 1) {
		return {
			labels: ["CPSC", "MATH", "BIOL", "CHEM", "ECON"],
			values: [30, 45, 18, 22, 12]
		};
	} else if (viewNum === 2) {
		return {
			labels: ["100", "200", "300", "400"],
			values: [75, 68, 70, 80]
		};
	} else {
		return {
			labels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
			values: [10, 14, 12, 9, 8]
		};
	}
}

// Chart.js
function renderChart(labels, values, viewNum) {
	const ctx = insightCanvas.getContext("2d");

	if (currentChart) {
		currentChart.destroy();
	}

	const chartType = viewNum === 3 ? "line" : "bar";

	currentChart = new Chart(ctx, {
		type: chartType,
		data: {
			labels,
			datasets: [{
				label: "Insight " + viewNum,
				data: values
			}]
		},
		options: {
			responsive: true,
			plugins: {
				legend: { display: false }
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: { stepSize: 5 }
				}
			}
		}
	});
}

function openModal() {
	modalBackdrop.style.display = "flex";
}
function closeModal() {
	modalBackdrop.style.display = "none";
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
	if (e.target === modalBackdrop) {
		closeModal();
	}
});

loadDatasets();
setStatus("Ready.", "");
