const { EventEmitter } = require('events');
const { socialRequest, version, checkLogin, user, languages } = require('./bloxd/types/browser_info.js');
const BloxClient = require('./bloxd/client.js');
const handlers = require('./bloxd/handlers/init.js');
const mc = require('minecraft-protocol');

const SERVER_OPTIONS = {
	'online-mode': false,
	motd: '\u00a76' + ' '.repeat(14) + 'Bloxd Translation Layer \u00a7c[1.8]\n\u00a7a' + ' '.repeat(21) + 'Made by 7GrandDad',
	favicon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAARFJREFUeF7tmTEOAUEUhncuoVEujUJJJxRbbKJRuACNRkTlDDQieheQUCq2IEoliQalc3CDX/Gq8b5tXyY7+fPe983shmZa+iSOn0AAdAAjAAMcMzABglgAC2ABLIAFHCeABtEgGkSDaNCxBLgMoUE0iAbRoNTgLGtELYl5cZH7/wlBAqADGAEYEHMCQBALGDV4ur/lBPQ7Z1kf1JemCdpcp3L99tiS9XatbDsHEAAdwAjAAJUAEMQCkWtwN+rK7wH5ai8ZUK2ksn4YZ6ZzQL4u5PrH86XfP+npcwAB0AGMAAxQlACCWODPNXhbDH3/HicAOoARgAGm20rkiwMQBIJAEAhGzjHT9oEgFsACWMC1Bb7sOyCgfI4PEQAAAABJRU5ErkJggg==',
	maxPlayers: 1,
	keepAlive: true,
	version: '1.8.9'
};

class TranslationLayerService extends EventEmitter {
	constructor() {
		super();
		this.status = 'stopped';
		this.connected = false;
		this.playerName = undefined;
		this.currentGame = undefined;
		this.currentLobby = undefined;
		this.server = undefined;
		this.bloxDClient = undefined;
		this.handlersReady = false;
		this.runtimeMode = 'node-colyseus';
		this.pageRuntimeProvider = undefined;
	}

	getState() {
		return {
			status: this.status,
			connected: this.connected,
			playerName: this.playerName,
			currentGame: this.currentGame,
			currentLobby: this.currentLobby,
			runtimeMode: this.runtimeMode,
			version,
			address: 'localhost',
			minecraftVersion: '1.8.9'
		};
	}

	setRuntimeMode(mode) {
		this.runtimeMode = mode === 'page-client' ? 'page-client' : 'node-colyseus';
		this.emit('status', this.getState());
	}

	setPageRuntimeProvider(provider) {
		this.pageRuntimeProvider = provider;
	}

	setStatus(status, error) {
		this.status = status;
		this.emit('status', this.getState(), error ? String(error) : undefined);
	}

	cleanup(teleport) {
		this.connected = teleport ?? false;
		Object.values(handlers).forEach((handler) => handler.cleanup(teleport));
		this.emit('status', this.getState());
	}

	async queue(gamemode, roomId) {
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

	async connect(client, requeue, gamemode, roomId) {
		if (requeue) {
			if (this.bloxDClient) {
				this.bloxDClient.disconnect();
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
		this.cleanup(true);

		if (this.runtimeMode == 'page-client') {
			await this.connectViaPageClient(client, requeue, gamemode, roomId);
			return;
		}

		let fetched;
		for (let i = 0; i < 2; i++) {
			fetched = await this.queue(gamemode, roomId);
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
		this.currentGame = fetched.gameNameWithVariation;
		this.currentLobby = fetched.lobbyName;
		this.emit('status', this.getState());
		console.log(`\x1b[36m[*] Connecting to wss://${fetched.gameServerHost} : Lobby ${fetched.lobbyName} : ${fetched.gameNameWithVariation}\x1b[0m`);
		if (client.ended) return;

		this.bloxDClient = new BloxClient(fetched, (message) => {
			client.end(message);
		});

		this.bloxDClient.name = user.name;
		this.bloxDClient.on('SPacketJoinGame', (data) => {
			this.bloxDClient.pass = data.pass;

			Object.values(handlers).forEach((handler) => handler.bloxd(this.bloxDClient, data));
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

		this.bloxDClient.on('SPacketKick', (data) => {
			client.end(data);
		});
	}

	async connectViaPageClient(client, requeue, gamemode, roomId) {
		if (!this.pageRuntimeProvider || typeof this.pageRuntimeProvider.createPageClient != 'function') {
			client.end('Electron Bloxd page runtime is not available.');
			return;
		}

		const requestData = {
			gameNameWithVariation: gamemode ?? 'skywars'
		};
		if (roomId != null) requestData.lobbyNameOrDiscordContext = roomId;

		console.log(`\x1b[36m[*] Page-client request: ${JSON.stringify(requestData)}\x1b[0m`);
		this.bloxDClient = await this.pageRuntimeProvider.createPageClient(requestData);
		this.bloxDClient.name = user.name;

		this.bloxDClient.on('SPacketJoinGame', (data) => {
			this.currentGame = this.bloxDClient.gameName;
			this.currentLobby = this.bloxDClient.lobbyName;
			this.emit('status', this.getState());
			Object.values(handlers).forEach((handler) => handler.bloxd(this.bloxDClient, data));
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

		this.bloxDClient.on('SPacketKick', (data) => {
			client.end(data);
		});

		await this.bloxDClient.connect();
	}

	ensureHandlers() {
		if (this.handlersReady) return;
		Object.values(handlers).forEach((handler) => handler.obtainHandlers(handlers, this.connect.bind(this)));
		this.handlersReady = true;
	}

	async start() {
		if (this.status === 'running' || this.status === 'starting') return this.getState();
		this.setStatus('starting');
		try {
			this.ensureHandlers();
			this.server = mc.createServer(SERVER_OPTIONS);
			this.server.on('playerJoin', async (client) => {
				if (this.connected) {
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

				this.playerName = client.username;
				this.emit('minecraft-client', {connected: true, username: client.username});
				this.emit('status', this.getState());

				client.on('end', () => {
					if (this.bloxDClient) this.bloxDClient.disconnect();
					this.playerName = undefined;
					this.currentGame = undefined;
					this.currentLobby = undefined;
					this.emit('minecraft-client', {connected: false});
					this.cleanup();
				});

				Object.values(handlers).forEach((handler) => handler.minecraft(client));

				await this.connect(client);
				this.connected = !client.ended;
				this.emit('status', this.getState());
			});

			console.log('\x1b[33mBloxd Translation Layer Started!\nDeveloped & maintained by 7GrandDad (https://youtube.com/c/7GrandDadVape)\nVersion: v' + version + '\x1b[0m');
			if (this.runtimeMode != 'page-client') {
				await checkLogin();
			}
			handlers.misc.friends.refreshData();
			this.setStatus('running');
			return this.getState();
		} catch (err) {
			this.setStatus('error', err);
			throw err;
		}
	}

	async stop() {
		if (this.status === 'stopped' || this.status === 'stopping') return this.getState();
		this.setStatus('stopping');
		if (this.bloxDClient) {
			this.bloxDClient.disconnect();
			this.bloxDClient = undefined;
		}
		this.cleanup();
		await new Promise((resolve) => {
			if (!this.server) return resolve();
			this.server.close(() => resolve());
			this.server = undefined;
		});
		this.playerName = undefined;
		this.currentGame = undefined;
		this.currentLobby = undefined;
		this.setStatus('stopped');
		return this.getState();
	}

	async restart() {
		await this.stop();
		return await this.start();
	}
}

module.exports = {
	TranslationLayerService,
	createService: () => new TranslationLayerService()
};
