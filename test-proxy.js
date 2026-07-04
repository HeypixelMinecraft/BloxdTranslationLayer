// Test: checkLogin → wait for Tampermonkey/browser proxy → socialRequest matchmake via proxy
const bi = require('./bloxd/types/browser_info.js');
(async () => {
	await bi.checkLogin();
	console.log('Login done. Waiting for browser proxy to connect (30s timeout)...');
	const connected = await bi.waitForTampermonkey(30000);
	console.log('Browser proxy connected:', connected);
	if (!connected) {
		console.log('Timeout: no browser proxy connected. Aborting.');
		process.exit(1);
	}
	console.log('Sending matchmake request via browser proxy...');
	try {
		const res = await bi.socialRequest('bloxd-matchmake', {
			gameNameWithVariation: 'skywars',
			languages: bi.languages
		});
		console.log('--- matchmake response ---');
		console.log('status:', res.status, res.statusText);
		console.log('body:', await res.text());
	} catch (err) {
		console.log('Error:', err.message);
	}
	process.exit(0);
})();
