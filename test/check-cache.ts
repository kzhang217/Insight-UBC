import InsightFacade from "../src/controller/InsightFacade";
import { InsightDatasetKind } from "../src/controller/IInsightFacade";
import * as fs from "fs-extra";
import * as path from "path";

(async () => {
	const dataDir = path.join(__dirname, "../data");

	// 清理旧缓存
	await fs.remove(dataDir);

	const facade1 = new InsightFacade();

	console.log("➤ Step 1: adding dataset...");
	const content = await fs.readFile(path.join(__dirname, "./resources/archives/pair.zip"), { encoding: "base64" });
	await facade1.addDataset("sections", content, InsightDatasetKind.Sections);

	console.log("✅ Dataset added.");

	const list1 = await facade1.listDatasets();
	console.log("Current datasets after add:", list1);

	// 模拟重启 —— 创建新的 InsightFacade 实例
	console.log("\n➤ Step 2: reloading from disk...");
	const facade2 = new InsightFacade();
	// 等待 loadDatasets 完成
	// @ts-ignore
	await facade2.ready;

	const list2 = await facade2.listDatasets();
	console.log("Datasets after reload:", list2);

	if (list2.length === 1 && list2[0].id === "sections") {
		console.log("\n✅ Cache test passed: dataset successfully reloaded from disk!");
	} else {
		console.log("\n❌ Cache test failed: dataset not loaded correctly.");
	}
})();
