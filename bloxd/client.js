const { Client } = require('colyseus.js');
const { browser, metrics, version, matchmaking, gen3PSIDMCPP, languages } = require('./types/browser_info.js');
const { ServerBuffer, ClientBuffer, packets } = require('./types/packets.js');
const { EventEmitter } = require('ws');
const { PACKET_SEND_EXP_KEY, PACKET_SEND_VER_KEY } = require('./types/anticheat_constants.js');
const PACKETS = require('./types/packets.js');
const KICKS = require('./types/kicks.js');

function isView(obj) {
	return ArrayBuffer.isView(obj) && !(obj instanceof DataView)
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

		const matchMakingResult = wsClient.joinOrCreate(fetched.gameNameWithVariation, {
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
		});
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
						this.packetEvent.emit(id, ServerBuffer[id] && ServerBuffer[id].fromBuffer(Buffer.from(data)) || data);
					} catch (err) {
						for (const [a, b] of Object.entries(PACKETS)) {
							if (b == id && a.includes('SPacket')) console.log(a, 'error', err);
						}
					}
				}
			});

			result.onLeave((code) => {
				if (this.connected) {
					callback(KICKS[code] ?? `Either your internet isn't working or this is a bug.\nCode: ${code}`);
				}
			});
		}).catch((err) => {
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
		if (this.room) {
			this.room.leave(true);
			this.room = false;
		}
	}
}