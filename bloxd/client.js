const { Client, Room } = require('colyseus.js');
const { browser, metrics, version, matchmaking, gen3PSIDMCPP, languages } = require('./types/browser_info.js');
const { ServerBuffer, ClientBuffer, packets } = require('./types/packets.js');
const { EventEmitter } = require('ws');
const fs = require('fs');
const path = require('path');
const { PACKET_SEND_EXP_KEY, PACKET_SEND_VER_KEY } = require('./types/anticheat_constants.js');
const PACKETS = require('./types/packets.js');
const KICKS = require('./types/kicks.js');
const activeClients = new Set();
let crashHandlerInstalled = false;
let roomPrototypeDiagnosticsInstalled = false;
const decodeErrors = new Map();
const passthroughPackets = new Map();
const officialBinaryPacketIds = new Map();
let packetMapLogged = false;
const DIAGNOSTICS_DIR = path.resolve(__dirname, '..', 'diagnostics');
const FRAME_RING_SIZE = 50;
const PROTOCOL_NAMES = {
	9: 'HANDSHAKE',
	10: 'JOIN_ROOM',
	11: 'ERROR',
	12: 'LEAVE_ROOM',
	13: 'ROOM_DATA',
	14: 'ROOM_STATE',
	15: 'ROOM_STATE_PATCH',
	16: 'ROOM_DATA_SCHEMA',
	17: 'ROOM_DATA_BYTES'
};

function isView(obj) {
	return ArrayBuffer.isView(obj) && !(obj instanceof DataView)
}

function packetName(id) {
	for (const [name, value] of Object.entries(PACKETS)) {
		if (value == id && name.includes('SPacket')) return name;
	}
	return `UnknownPacket(${id})`;
}

function officialBinaryState(id) {
	if (!officialBinaryPacketIds.has(Number(id))) return 'unknown';
	return officialBinaryPacketIds.get(Number(id)) ? true : false;
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
	return undefined;
}

function frameSummary(data) {
	const packetBuffer = toPacketBuffer(data);
	if (!packetBuffer) {
		return {
			type: data == null ? String(data) : data.constructor?.name ?? typeof data,
			length: data?.byteLength ?? data?.length,
			protocol: 'UNKNOWN',
			protocolCode: null,
			hex: sampleData(data)
		};
	}
	const protocolCode = packetBuffer[0];
	return {
		type: packetBuffer.constructor.name,
		length: packetBuffer.length,
		protocol: PROTOCOL_NAMES[protocolCode] ?? `UNKNOWN_${protocolCode}`,
		protocolCode,
		hex: packetBuffer.toString('hex', 0, Math.min(packetBuffer.length, 64))
	};
}

function createDiagnosticsContext(fetched) {
	return {
		file: path.join(DIAGNOSTICS_DIR, `colyseus-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`),
		game: fetched.gameNameWithVariation,
		lobby: fetched.lobbyName,
		host: fetched.gameServerHost,
		frames: [],
		schemaErrors: 0,
		packetErrors: 0,
		lastGameplayPacketAt: 0,
		schemaDegraded: false,
		packetMapFile: path.join(DIAGNOSTICS_DIR, `local-packet-map-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
	};
}

function writeLocalPacketMap(diag) {
	if (!diag || packetMapLogged) return;
	packetMapLogged = true;
	try {
		fs.mkdirSync(DIAGNOSTICS_DIR, {recursive: true});
		const serverPackets = {};
		for (const [name, value] of Object.entries(PACKETS)) {
			if (name.includes('SPacket') && Number.isInteger(value)) {
				serverPackets[value] = name;
			}
		}
		fs.writeFileSync(diag.packetMapFile, JSON.stringify({
			at: new Date().toISOString(),
			game: diag.game,
			lobby: diag.lobby,
			host: diag.host,
			serverPackets
		}, null, 2));
		console.log(`\x1b[36m[*] Local server packet map written to ${diag.packetMapFile}\x1b[0m`);
	} catch (err) {
		console.log(`\x1b[33m[!] Failed to write local packet map: ${err.message}\x1b[0m`);
	}
}

function pushFrame(diag, data, direction = 'in') {
	if (!diag) return;
	diag.frames.push({
		at: new Date().toISOString(),
		direction,
		...frameSummary(data)
	});
	if (diag.frames.length > FRAME_RING_SIZE) {
		diag.frames.shift();
	}
}

function writeDiagnostic(diag, kind, payload) {
	if (!diag) return;
	try {
		fs.mkdirSync(DIAGNOSTICS_DIR, {recursive: true});
		fs.appendFileSync(diag.file, JSON.stringify({
			at: new Date().toISOString(),
			kind,
			game: diag.game,
			lobby: diag.lobby,
			host: diag.host,
			schemaDegraded: diag.schemaDegraded,
			...payload,
			recentFrames: diag.frames
		}) + '\n');
	} catch (writeErr) {
		console.log(`\x1b[33m[!] Failed to write Colyseus diagnostics: ${writeErr.message}\x1b[0m`);
	}
}

function findDiagnosticsForRoom(room) {
	for (const entry of activeClients) {
		if (entry.client?.room === room) return entry.diagnostics;
	}
	if (activeClients.size == 1) {
		return activeClients.values().next().value?.diagnostics;
	}
	return undefined;
}

function isColyseusSchemaError(err) {
	const stack = String(err && (err.stack || err.message || err));
	return stack.includes('@colyseus/schema') || stack.includes('SchemaSerializer') || stack.includes('Room.patch') || stack.includes('Room.setState') || stack.includes('"refId" not found');
}

function installRoomPrototypeDiagnostics() {
	if (roomPrototypeDiagnosticsInstalled || !Room?.prototype) return;
	roomPrototypeDiagnosticsInstalled = true;

	const originalOnMessageCallback = Room.prototype.onMessageCallback;
	if (typeof originalOnMessageCallback == 'function') {
		Room.prototype.onMessageCallback = function(event) {
			const diag = findDiagnosticsForRoom(this);
			pushFrame(diag, event?.data, 'in');
			try {
				return originalOnMessageCallback.call(this, event);
			} catch (err) {
				if (!isColyseusSchemaError(err)) throw err;
				const activeDiag = findDiagnosticsForRoom(this);
				if (activeDiag) {
					activeDiag.schemaErrors++;
					activeDiag.schemaDegraded = true;
				}
				for (const entry of activeClients) {
					if (entry.client?.room === this || activeClients.size == 1) {
						entry.client.schemaDegraded = true;
					}
				}
				writeDiagnostic(activeDiag, 'schema-message-error', {
					error: err.message,
					stack: err.stack,
					frame: frameSummary(event?.data),
					schemaErrors: activeDiag?.schemaErrors
				});
				console.log(`\x1b[31m[!] Colyseus schema message failed; continuing in degraded mode. Diagnostics: ${activeDiag?.file ?? 'unavailable'}\x1b[0m`);
				return undefined;
			}
		};
	}

	for (const method of ['setState', 'patch']) {
		if (typeof Room.prototype[method] != 'function') continue;
		const original = Room.prototype[method];
		Room.prototype[method] = function(payload) {
			try {
				return original.call(this, payload);
			} catch (err) {
				if (!isColyseusSchemaError(err)) throw err;
				const diag = findDiagnosticsForRoom(this);
				if (diag) {
					diag.schemaErrors++;
					diag.schemaDegraded = true;
				}
				for (const entry of activeClients) {
					if (entry.client?.room === this || activeClients.size == 1) {
						entry.client.schemaDegraded = true;
					}
				}
				writeDiagnostic(diag, `schema-${method}-error`, {
					error: err.message,
					stack: err.stack,
					frame: frameSummary(payload),
					schemaErrors: diag?.schemaErrors
				});
				console.log(`\x1b[31m[!] Colyseus schema ${method} failed; continuing in degraded mode. Diagnostics: ${diag?.file ?? 'unavailable'}\x1b[0m`);
				return undefined;
			}
		};
	}
}

function logDecodeError(id, data, err, diag) {
	const key = `${id}:${err.message}`;
	const count = (decodeErrors.get(key) ?? 0) + 1;
	decodeErrors.set(key, count);
	if (diag) {
		diag.packetErrors++;
		writeDiagnostic(diag, 'packet-decode-error', {
			packetId: id,
			packetName: packetName(id),
			error: err.message,
			stack: err.stack,
			officialBinary: officialBinaryState(id),
			dataType: data == null ? String(data) : data.constructor?.name ?? typeof data,
			sample: sampleData(data)
		});
	}
	if (count <= 5 || count % 25 == 0) {
		console.log(`\x1b[33m[!] ${packetName(id)} decode failed #${count}: ${err.message}\n    id=${id} type=${data == null ? data : data.constructor?.name ?? typeof data} sample=${sampleData(data)}\x1b[0m`);
	}
}

function logPacketPassthrough(id, data, reason, diag) {
	const key = `${id}:${reason}`;
	const count = (passthroughPackets.get(key) ?? 0) + 1;
	passthroughPackets.set(key, count);
	if (diag && (count <= 5 || count % 50 == 0)) {
		writeDiagnostic(diag, 'packet-passthrough', {
			packetId: id,
			packetName: packetName(id),
			reason,
			officialBinary: officialBinaryState(id),
			dataType: data == null ? String(data) : data.constructor?.name ?? typeof data,
			sample: sampleData(data)
		});
	}
	if (count <= 5 || count % 50 == 0) {
		console.log(`\x1b[36m[*] ${packetName(id)} passed through #${count}: ${reason}; type=${data == null ? data : data.constructor?.name ?? typeof data} sample=${sampleData(data)}\x1b[0m`);
	}
}

function installCrashHandler() {
	if (crashHandlerInstalled) return;
	crashHandlerInstalled = true;
	installRoomPrototypeDiagnostics();
	process.prependListener('uncaughtException', (err) => {
		const stack = String(err && (err.stack || err.message || err));
		if (!isColyseusSchemaError(err)) {
			throw err;
		}

		console.log(`\x1b[31m[!] Uncaught Colyseus schema error, Bloxd schema likely changed. Keeping clients alive where possible.\n${stack}\x1b[0m`);
		for (const entry of activeClients) {
			if (entry.client) entry.client.schemaDegraded = true;
			if (entry.diagnostics) {
				entry.diagnostics.schemaDegraded = true;
				writeDiagnostic(entry.diagnostics, 'uncaught-schema-error', {error: err.message, stack});
			}
		}
	});
}

function installColyseusDiagnostics(client, room, diag) {
	const ws = room?.connection?.transport?.ws;
	if (ws && typeof ws.onmessage == 'function' && !ws.__bloxdDiagnosticsWrapped) {
		const originalOnMessage = ws.onmessage;
		ws.onmessage = function(event) {
			pushFrame(diag, event?.data, 'in');
			return originalOnMessage.call(this, event);
		};
		ws.__bloxdDiagnosticsWrapped = true;
	}

	for (const method of ['setState', 'patch']) {
		if (typeof room[method] != 'function' || room[`__bloxd_${method}_wrapped`]) continue;
		const original = room[method];
		room[method] = function(payload) {
			try {
				return original.call(this, payload);
			} catch (err) {
				if (!isColyseusSchemaError(err)) throw err;
				diag.schemaErrors++;
				diag.schemaDegraded = true;
				client.schemaDegraded = true;
				writeDiagnostic(diag, `schema-${method}-error`, {
					error: err.message,
					stack: err.stack,
					frame: frameSummary(payload),
					schemaErrors: diag.schemaErrors
				});
				console.log(`\x1b[31m[!] Colyseus schema ${method} failed #${diag.schemaErrors}; continuing in degraded mode. Diagnostics: ${diag.file}\x1b[0m`);
				return undefined;
			}
		};
		room[`__bloxd_${method}_wrapped`] = true;
	}
}

function transformView(obj) {
	if (isView(obj))
		return [...obj];
	if (typeof obj == 'object')
		for (const i in obj)
			obj[i] = transformView(obj[i]);
	return obj;
}

class BloxClient {
	room = false
	connected = true
	handlers = {}
	settings = {}
	settingsEvent = new EventEmitter()
	packetEvent = new EventEmitter()
	diagnostics = false
	schemaDegraded = false
	constructor(fetched, callback) {
		installCrashHandler();
		this.diagnostics = createDiagnosticsContext(fetched);
		writeLocalPacketMap(this.diagnostics);
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
		const activeEntry = {client: this, callback, diagnostics: this.diagnostics};
		activeClients.add(activeEntry);
		const matchMakingResult = wsClient.joinOrCreate(fetched.gameNameWithVariation, joinOptions);
		this.ip = `https://${fetched.gameServerHost}`;
		this.gameName = fetched.gameNameWithVariation;
		this.lobbyName = fetched.lobbyName;

		matchMakingResult.then(result => {
			this.room = result;
			installColyseusDiagnostics(this, result, this.diagnostics);

			if (!this.connected) {
				result.leave(true);
				return;
			}

			result.onMessage('*', (id, data) => {
				if (this.connected) {
					try {
						if (this.diagnostics) {
							this.diagnostics.lastGameplayPacketAt = Date.now();
						}
						if (ServerBuffer[id]) {
							const packetBuffer = toPacketBuffer(data);
							if (packetBuffer) {
								const binaryState = officialBinaryState(id);
								const allowJoinGameBootstrap = !this.pass && id == PACKETS.SPacketJoinGame;
								if (binaryState === true || allowJoinGameBootstrap) {
									try {
										this.packetEvent.emit(id, ServerBuffer[id].fromBuffer(packetBuffer));
									} catch (err) {
										const reason = err && err.message == 'trailing data' ? 'local schema mismatch: trailing data' : err.message;
										logPacketPassthrough(id, data, reason, this.diagnostics);
										this.packetEvent.emit(id, data);
									}
								} else {
									logPacketPassthrough(id, data, `official binary is ${binaryState}`, this.diagnostics);
									this.packetEvent.emit(id, data);
								}
							} else {
								logPacketPassthrough(id, data, 'official payload is not binary', this.diagnostics);
								this.packetEvent.emit(id, data);
							}
						} else {
							logPacketPassthrough(id, data, 'no local decoder registered', this.diagnostics);
							this.packetEvent.emit(id, data);
						}
					} catch (err) {
						logDecodeError(id, data, err, this.diagnostics);
					}
				}
			});

			result.onLeave((code) => {
				activeClients.delete(activeEntry);
				if (this.connected) {
					writeDiagnostic(this.diagnostics, 'room-leave', {
						code,
						packetErrors: this.diagnostics?.packetErrors,
						schemaErrors: this.diagnostics?.schemaErrors,
						lastGameplayPacketAt: this.diagnostics?.lastGameplayPacketAt
					});
					if (this.schemaDegraded) {
						callback(`Bloxd protocol changed; diagnostics written to ${this.diagnostics.file}\nCode: ${code}`);
					} else {
						callback(KICKS[code] ?? `Either your internet isn't working or this is a bug.\nCode: ${code}`);
					}
				}
			});
		}).catch((err) => {
			activeClients.delete(activeEntry);
			writeDiagnostic(this.diagnostics, 'join-error', {
				code: err?.code,
				message: err?.message,
				stack: err?.stack
			});
			const errCode = err?.code;
			const errMessage = err?.message;
			callback(KICKS[errCode] ?? (errMessage ? errMessage : `Either your internet isn't working or this is a bug.\nCode: ${errCode}`));
			if (errCode == 4047 || errCode == 4049) {
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
			pushFrame(this.diagnostics, data, 'out');
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

BloxClient.updateOfficialPacketHint = function(packetId, isBinary) {
	if (packetId == null || isBinary == null) return;
	const id = Number(packetId);
	if (!Number.isInteger(id)) return;
	officialBinaryPacketIds.set(id, Boolean(isBinary));
};

BloxClient.getOfficialPacketHints = function() {
	return Object.fromEntries(officialBinaryPacketIds.entries());
};

module.exports = BloxClient;
