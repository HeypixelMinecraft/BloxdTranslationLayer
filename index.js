const { createService } = require('./server.js');

const service = createService();

service.start().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});

process.on('SIGINT', async () => {
	await service.stop().catch(() => {});
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await service.stop().catch(() => {});
	process.exit(0);
});
