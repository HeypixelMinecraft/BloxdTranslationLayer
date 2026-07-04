const { socialRequest, version, checkLogin, user, languages } = require('./bloxd/types/browser_info.js');
const BloxClient = require('./bloxd/client.js');
const handlers = require('./bloxd/handlers/init.js');
const mc = require('minecraft-protocol');
const server = mc.createServer({
	'online-mode': false,
	motd: '\u00a76' + ' '.repeat(14) + 'Bloxd Translation Layer \u00a7c[1.8]\n\u00a7a' + ' '.repeat(21) + 'Made by 7GrandDad',
	favicon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAARFJREFUeF7tmTEOAUEUhncuoVEujUJJJxRbbKJRuACNRkTlDDQieheQUCq2IEoliQalc3CDX/Gq8b5tXyY7+fPe983shmZa+iSOn0AAdAAjAAMcMzABglgAC2ABLIAFHCeABtEgGkSDaNCxBLgMoUE0iAbRoNTgLGtELYl5cZH7/wlBAqADGAEYEHMCQBALGDV4ur/lBPQ7Z1kf1JemCdpcp3L99tiS9XatbDsHEAAdwAjAAJUAEMQCkWtwN+rK7wH5ai8ZUK2ksn4YZ6ZzQL4u5PrH86XfP+npcwAB0AGMAAxQlACCWODPNXhbDH3/HicAOoARgAGm20rkiwMQBIJAEAhGzjHT9oEgFsACWMC1Bb7sOyCgfI4PEQAAAABJRU5ErkJggg==',
	maxPlayers: 1,
	keepAlive: true,
	version: '1.8.9'
});
let connected;
let bloxDClient;

function cleanup(teleport) {
	connected = teleport ?? false;
	Object.values(handlers).forEach((handler) => handler.cleanup(teleport));
}

async function queue(gamemode, roomId) {
	try {
		const requestData = {
			gameNameWithVariation: gamemode ?? 'skywars',
			languages: languages
		};
		if (roomId != null) {
			requestData.lobbyNameOrDiscordContext = roomId;
		}
		console.log(`\x1b[36m[*] Queue request: ${JSON.stringify(requestData)}\x1b[0m`);
		return await socialRequest('bloxd-matchmake', requestData);
	} catch (exception) {
		console.log(`\x1b[36m[*] Queue request exception: ${exception}\x1b[0m`);
		return {
			ok: false,
			status: 0,
			statusText: 'Proxy Error',
			text: async () => String(exception),
			json: async () => { throw exception; }
		};
	}
}

async function connect(client, requeue, gamemode, roomId) {
	if (requeue) {
		if (bloxDClient) {
			bloxDClient.disconnect();
		}

		client.write('respawn', {
			dimension: 1,
			difficulty: 2,
			gamemode: 0,
			levelType: 'FLAT'
		});
		client.write('respawn', {
			dimension: 0,
			difficulty: 2,
			gamemode: 0,
			levelType: 'FLAT'
		});
	}
	cleanup(true);

	let fetched;
	for (let i = 0; i < 2; i++) {
		fetched = await queue(gamemode, roomId);
		if (!fetched.ok) {
			const responseText = await fetched.text().catch(() => 'No response body');
			console.log(`\x1b[36m[*] Queue request failed: ${fetched.status} ${fetched.statusText}\nBody: ${responseText}\x1b[0m`);

			if (fetched.statusText == 'Unauthorized' && i <= 0) {
				await checkLogin();
				continue;
			}

			client.end(`Queue request failed: ${fetched.statusText ?? 'Disconnected'}`);
			return;
		} else {
			break;
		}
	}

	fetched = await fetched.json();
	console.log(`\x1b[36m[*] Connecting to wss://${fetched.gameServerHost} : Lobby ${fetched.lobbyName} : ${fetched.gameNameWithVariation}\x1b[0m`);
	if (client.ended) return;

	bloxDClient = new BloxClient(fetched, (message) => {
		client.end(message);
	});

	bloxDClient.name = user.name;
	bloxDClient.on('SPacketJoinGame', (data) => {
		bloxDClient.pass = data.pass;

		Object.values(handlers).forEach((handler) => handler.bloxd(bloxDClient, data));
		if (!requeue) {
			client.write('login', {
				entityId: 99999,
				gameMode: 0,
				dimension: 0,
				difficulty: 2,
				maxPlayers: 1,
				levelType: 'default',
				reducedDebugInfo: false
			});
		}
	});

	bloxDClient.on('SPacketKick', (data) => {
		client.end(data);
	});
}

server.on('playerJoin', async function(client) {
	if (connected) {
		client.end('A player is already logged in!');
		return;
	}

	if (client.username == undefined || client.uuid == undefined) {
		client.end('Missing Username / UUID, please ensure you are using a valid cracked Minecraft account!');
		return;
	}

	if (client.protocolVersion != 47) {
		console.log(`\x1b[33m[*] Incorrect client version, Please use Minecraft 1.8.9!\x1b[0m`);
		return;
	}

	client.on('end', function() {
		if (bloxDClient) bloxDClient.disconnect();
		cleanup();
	});

	Object.values(handlers).forEach((handler) => handler.minecraft(client));

	await connect(client);
	connected = !client.ended;
});

(async () => {
	Object.values(handlers).forEach((handler) => handler.obtainHandlers(handlers, connect));
	console.log('\x1b[33mBloxd Translation Layer Started!\nDeveloped & maintained by 7GrandDad (https://youtube.com/c/7GrandDadVape)\nVersion: v' + version + '\x1b[0m');
	await checkLogin();
	handlers.misc.friends.refreshData();
})();