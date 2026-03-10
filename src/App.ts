import Server from "./rest/Server";

(async () => {
	const server = new Server(4321);
	await server.start();
})();

