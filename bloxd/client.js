const { Client } = require('colyseus.js');
const { browser, metrics, version, matchmaking, gen3PSIDMCPP, languages } = require('./types/browser_info.js');
const { ServerBuffer, ClientBuffer, packets } = require('./types/packets.js');
const { EventEmitter } = require('ws');
const { PACKET_SEND_EXP_KEY, PACKET_SEND_VER_KEY } = require('./types/anticheat_constants.js');
const PACKETS = require('./types/packets.js');
const KICKS = require('./types/kicks.js');
const activeClients = new Set();
let crashHandlerInstalled = false;
const decodeErrors = new Map();

function isView(obj) {
	return ArrayBuffer.isView(obj) && !(obj instanceof DataView)
}

function packetName(id) {
	for (const [name, value] of Object.entries(PACKETS)) {
		if (value == id && name.includes('SPacket')) return name;
	}
	return `UnknownPacket(${id})`;
}

function sampleData(data) {
	try {
		if (data == null) return String(data);
		if (Buffer.isBuffer(data)) return `Buffer(${data.length}) ${data.toString('hex', 0, Math.min(data.length, 32))}`;
		if (data instanceof ArrayBuffer) return `ArrayBuffer(${data.byteLength})`;
		if (isView(data)) return `${data.constructor.name}(${data.byteLength ?? data.length})`;
		if (typeof data == 'string') return data.length > 300 ? data.substring(0, 300) + '...' : data;
		const json = JSON.stringify(data);
		return json.length > 300 ? json.substring(0, 300) + '...' : json;
	} catch (err) {
		return `[unserializable ${typeof data}]`;
	}
}

function toPacketBuffer(data) {
	if (Buffer.isBuffer(data)) return data;
	if (data instanceof ArrayBuffer) return Buffer.from(data);
	if (isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	if (Array.isArray(data) || typeof data == 'string') return Buffer.from(data);
	return undefined;
}

function logDecodeError(id, data, err) {
	const key = `${id}:${err.message}`;
	const count = (decodeErrors.get(key) ?? 0) + 1;
	decodeErrors.set(key, count);
	if (count <= 5 || count % 25 == 0) {
		console.log(`\x1b[33m[!] ${packetName(id)} decode failed #${count}: ${err.message}\n    id=${id} type=${data == null ? data : data.constructor?.name ?? typeof data} sample=${sampleData(data)}\x1b[0m`);
	}
}

function installCrashHandler() {
	if (crashHandlerInstalled) return;
	crashHandlerInstalled = true;
	process.prependListener('uncaughtException', (err) => {
		const stack = String(err && (err.stack || err.message || err));
		const isColyseusSchemaError = stack.includes('@colyseus/schema') || stack.includes('SchemaSerializer') || stack.includes('Room.patch') || stack.includes('"refId" not found');
		if (!isColyseusSchemaError) {
			throw err;
		}

		console.log(`\x1b[31m[!] Colyseus schema patch error, Bloxd schema likely changed.\n${stack}\x1b[0m`);
		for (const entry of activeClients) {
			entry.client.connected = false;
			if (entry.client.room) {
				try {
					entry.client.room.leave(true);
				} catch (leaveErr) {}
				entry.client.room = false;
			}
			entry.callback('Bloxd schema changed; disconnected before Node crashed. Check packet diagnostic logs.');
		}
		activeClients.clear();
	});
}

function transformView(obj) {
	if (isView(obj))
		return [...obj];
	if (typeof obj == 'object')
		for (const i in obj)
			obj[i] = transformView(obj[i]);
	return obj;
}

module.exports = class BloxClient {
	room = false
	connected = true
	handlers = {}
	settings = {}
	settingsEvent = new EventEmitter()
	packetEvent = new EventEmitter()
	constructor(fetched, callback) {
		installCrashHandler();
		const wsClient = new Client(`wss://${fetched.gameServerHost}`);
		wsClient.http.headers = {
			'Origin': 'https://bloxd.io',
			'Referer': 'https://bloxd.io/',
			'User-Agent': browser.ua,
			'sec-fetch-dest': 'empty',
			'sec-fetch-mode': 'websocket',
			'sec-fetch-site': 'same-site'
		};

		if (matchmaking.trafficCode == '') {
			return callback('Please open up the tampermonkey script on the browser, refresh and try again.');
		}

		const joinOptions = {
			cookies: {
				origin: 'classic'
			},
			isMobile: false,
			generalCookies: {
				joinDiscord: false,
				newGo: 'c',
				...metrics,
				...matchmaking
			},
			browserInfo: browser,
			isLoggedIn: false,
			lobbyName: (fetched.gameNameWithVariation.includes('classic_playerSchematic') ? fetched.gameNameWithVariation.split('|')[1] + '|' : '') + fetched.lobbyName,
			languages: languages,
			version: version,
			siteUsed: 'bloxd',
			subsiteUsed: 'bloxd'
		};
		console.log(`\x1b[36m[*] Colyseus join payload: ${JSON.stringify({
			game: fetched.gameNameWithVariation,
			lobbyName: joinOptions.lobbyName,
			languages: joinOptions.languages,
			version: joinOptions.version,
			browser: joinOptions.browserInfo,
			generalCookieKeys: Object.keys(joinOptions.generalCookies)
		})}\x1b[0m`);
		const activeEntry = {client: this, callback};
		activeClients.add(activeEntry);
		const matchMakingResult = wsClient.joinOrCreate(fetched.gameNameWithVariation, joinOptions);
		this.ip = `https://${fetched.gameServerHost}`;
		this.gameName = fetched.gameNameWithVariation;
		this.lobbyName = fetched.lobbyName;

		matchMakingResult.then(result => {
			this.room = result;

			if (!this.connected) {
				result.leave(true);
				return;
			}

			result.onMessage('*', (id, data) => {
				if (this.connected) {
					try {
						if (ServerBuffer[id]) {
							const packetBuffer = toPacketBuffer(data);
							if (packetBuffer) {
								this.packetEvent.emit(id, ServerBuffer[id].fromBuffer(packetBuffer));
							} else {
								logDecodeError(id, data, new Error('expected binary packet but received non-buffer data'));
								this.packetEvent.emit(id, data);
							}
						} else {
							this.packetEvent.emit(id, data);
						}
					} catch (err) {
						logDecodeError(id, data, err);
					}
				}
			});

			result.onLeave((code) => {
				activeClients.delete(activeEntry);
				if (this.connected) {
					callback(KICKS[code] ?? `Either your internet isn't working or this is a bug.\nCode: ${code}`);
				}
			});
		}).catch((err) => {
			activeClients.delete(activeEntry);
			callback(KICKS[err.code] ?? (err.message != '' ? err.message : `Either your internet isn't working or this is a bug.\nCode: ${err.code}`));
			if (err.code == 4047 || err.code == 4049) {
				gen3PSIDMCPP(true);
			}
		});
	}
	on(id, callback) {
		return this.packetEvent.on(packets[id], callback);
	}
	send(id, data) {
		if (this.pass && this.room && this.connected && packets[id] != undefined) {
			id = packets[id];
			data = transformView(data);

			if (ClientBuffer[id]) {
				data = ClientBuffer[id].toBuffer(data);
			}

			if (isView(data)) {
				for (let i = 0; i < data.length; i++) {
					const const1 = this.pass[i % this.pass.length], const2 = this.pass[(i + 5) % this.pass.length];
					data[i] ^= const1 ^ PACKET_SEND_EXP_KEY ^ i + data.length * 3 ^ const2 ^ PACKET_SEND_VER_KEY;
				}
			}

			id ^= this.pass[2] ^ this.pass.length ^ PACKET_SEND_EXP_KEY ^ this.pass[6] ^ PACKET_SEND_VER_KEY;
			isView(data) ? this.room.sendBytes(id, data) : this.room.send(id, data);
		}
	}
	disconnect() {
		this.connected = false;
		for (const entry of activeClients) {
			if (entry.client === this) activeClients.delete(entry);
		}
		if (this.room) {
			this.room.leave(true);
			this.room = false;
		}
	}
}
