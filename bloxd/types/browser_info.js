const fs = require('fs');
const ws = require('ws');
const MCSPConst = 'wqMm7LRJ1jI9sp9B6bWKtsw3fJ7j';
const MCConst = '-OUv0hdWLNE4_EvgagxGBAuuxA5zKtG_kc2KXpv-DupjG-OugR56GFbhNcz0WCQx3Mg7hm-4xA45nErR8275n2PDPQcDclD9mRRgyIAAigWD6xHFj3pSSJwo5XkPpRg3Fg9vEoD7KdcfwXva0SM6CspiVn4IzwFv_PrHcZS7LVXuNSBgC58QHGKxUAS';
const LOGIN_PATH = './login.json';
const SETTINGS_PATH = './settings.json';
const HEADERS = {
	'Accept': 'application/json',
	'Content-Type': 'application/json',
	'Origin': 'https://bloxd.io',
	'sec-fetch-dest': 'empty',
	'sec-fetch-mode': 'cors',
	'sec-fetch-site': 'same-site',
	'Referer': 'https://bloxd.io/',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
};
let socialId = 1 + Math.floor(Math.random() * 17);
let lSocket, promise;
let wsServerStarted = false;
let matchmakeResolvers = {};

/**
 * Parses Set-Cookie header(s) into a key-value map.
 * @param {string | null} header
 * @returns {object}
 */
function parseSetCookie(header) {
	const cookies = {};
	if (!header) return cookies;
	const parts = Array.isArray(header) ? header : [header];
	for (const part of parts) {
		for (const cookie of part.split(',')) {
			const [kv] = cookie.split(';');
			const [key, value] = kv.trim().split('=');
			if (key && value !== undefined) cookies[key.trim()] = value.trim();
		}
	}
	return cookies;
}

/**
 * Builds the Cookie header value for social API requests.
 * @returns {string}
 */
function buildCookieHeader() {
	const parts = [
		`___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}`,
		`___Secure-3PSIDMCPP=${exports.metrics['3PSIDMCPP']}`,
		`___Secure-3PSIDMCSP=${exports.metrics['3PSIDMCSP']}`
	];
	if (exports.cookies.bb_u_id) parts.push(`bb_u_id=${exports.cookies.bb_u_id}`);
	if (exports.cookies.bb_u_h_init) parts.push(`bb_u_h_init=${exports.cookies.bb_u_h_init}`);
	return parts.join('; ');
}

/**
 * Adds 32 zero's as a base into the specified string.
 * @param {string} input
 * @returns {string}
 */
function addPadding(input) {
	return (input >>> 0).toString(2).padStart(32, '0');
};

/**
 * Generates a random specified character length string.
 * @param {number | undefined} length Random string length
 * @returns {string}
*/
function genString() {
	let length = arguments.length > 0 ? arguments[0] : 21;
	return crypto.getRandomValues(new Uint8Array(length)).reduce(((val, ind) => val += (ind &= 63) < 36 ? ind.toString(36) : ind < 62 ? (ind - 26).toString(36).toUpperCase() : ind > 62 ? '-' : '_'), '');
};

/**
 * Generates a compliant tracking string based on the input.
 * @param {string} input Base input
 * @returns {string}
*/
function genCompliance(input) {
	let compliance = '';
	for (let i = 0; i < 10; i++) {
		compliance += (input[i] ?? i.toString()).charCodeAt(0).toString(32);
	}
	return compliance;
};

/**
 * Generates the unique MCSP version token.
 * @param {string} input - Padded version number
 * @returns {string}
*/
function gen3PSIDMCSP(input) {
	let token = '';
	return token += input[26],
	token += MCSPConst[9],
	token += input[10],
	token += MCSPConst[24],
	token += input[15],
	token += MCSPConst[23],
	token += MCSPConst[19],
	token += MCSPConst[16],
	token += MCSPConst[7],
	token += input[4],
	token += input[12],
	token += MCSPConst[11],
	token += MCSPConst[3],
	token += input[31],
	token += input[27],
	token += input[9],
	token += input[29],
	token += input[7],
	token += input[16],
	token += input[14],
	token += input[23],
	token += MCSPConst[27],
	token += input[21],
	token += input[0],
	token += MCSPConst[8],
	token += input[18],
	token += MCSPConst[21],
	token += input[25],
	token += MCSPConst[4],
	token += MCSPConst[0],
	token += MCSPConst[10],
	token += MCSPConst[5],
	token += MCSPConst[2],
	token += MCSPConst[14],
	token += input[24],
	token += MCSPConst[13],
	token += input[8],
	token += MCSPConst[1],
	token += input[1],
	token += input[17],
	token += input[6],
	token += MCSPConst[6],
	token += input[20],
	token += input[3],
	token += MCSPConst[20],
	token += MCSPConst[12],
	token += MCSPConst[22],
	token += input[22],
	token += input[19],
	token += MCSPConst[15],
	token += input[5],
	token += input[2],
	token += input[13],
	token += MCSPConst[25],
	token += input[11],
	token += input[30],
	token += MCSPConst[17],
	token += MCSPConst[18],
	token += MCSPConst[26],
	token += input[28],
	token
};

/**
 * Generates the unique MC identifier token.
 * @param {string} input1 - Random string 1
 * @param {string} input2 - Random string 2
 * @param {string | undefined} input3 - Unused string 3
 * @returns {string}
*/
function gen3PSIDMC(input1, input2, input3) {
	let token = '';
	return token += MCConst[30],
	token += input2[17],
	token += MCConst[12],
	token += MCConst[129],
	token += MCConst[11],
	token += MCConst[132],
	token += MCConst[6],
	token += MCConst[176],
	token += MCConst[19],
	token += input2[16],
	token += MCConst[65],
	token += MCConst[45],
	token += MCConst[67],
	token += input2[4],
	token += MCConst[86],
	token += input2[0],
	token += input1[1],
	token += MCConst[146],
	token += MCConst[1],
	token += MCConst[100],
	token += MCConst[11],
	token += MCConst[36],
	token += MCConst[155],
	token += MCConst[97],
	token += MCConst[88],
	token += input1[14],
	token += input1[10],
	token += MCConst[178],
	token += MCConst[166],
	token += MCConst[105],
	token += MCConst[161],
	token += MCConst[93],
	token += MCConst[130],
	token += MCConst[6],
	token += MCConst[87],
	token += MCConst[40],
	token += MCConst[5],
	token += input2[20],
	token += MCConst[16],
	token += MCConst[114],
	token += MCConst[16],
	token += MCConst[96],
	token += input2[7],
	token += input2[14],
	token += MCConst[111],
	token += MCConst[117],
	token += input1[2],
	token += MCConst[107],
	token += MCConst[94],
	token += MCConst[147],
	token += MCConst[17],
	token += MCConst[133],
	token += MCConst[24],
	token += MCConst[7],
	token += input1[19],
	token += MCConst[44],
	token += input2[3],
	token += MCConst[22],
	token += MCConst[164],
	token += MCConst[115],
	token += MCConst[82],
	token += MCConst[153],
	token += MCConst[160],
	token += MCConst[173],
	token += MCConst[27],
	token += MCConst[154],
	token += input2[10],
	token += MCConst[2],
	token += MCConst[58],
	token += MCConst[89],
	token += MCConst[85],
	token += MCConst[62],
	token += input1[7],
	token += input1[15],
	token += MCConst[76],
	token += MCConst[125],
	token += MCConst[51],
	token += input1[13],
	token += MCConst[145],
	token += MCConst[127],
	token += MCConst[143],
	token += MCConst[119],
	token += MCConst[131],
	token += MCConst[10],
	token += MCConst[134],
	token += input2[18],
	token += MCConst[9],
	token += MCConst[43],
	token += input2[8],
	token += MCConst[13],
	token += MCConst[79],
	token += MCConst[20],
	token += MCConst[32],
	token += MCConst[128],
	token += MCConst[120],
	token += input1[0],
	token += MCConst[74],
	token += MCConst[179],
	token += MCConst[23],
	token += MCConst[171],
	token += MCConst[78],
	token += MCConst[124],
	token += MCConst[31],
	token += input2[13],
	token += MCConst[68],
	token += MCConst[182],
	token += input2[6],
	token += input2[12],
	token += MCConst[151],
	token += input1[20],
	token += input1[12],
	token += MCConst[122],
	token += MCConst[15],
	token += input1[11],
	token += MCConst[156],
	token += MCConst[9],
	token += MCConst[104],
	token += MCConst[184],
	token += MCConst[39],
	token += input2[9],
	token += MCConst[168],
	token += MCConst[123],
	token += MCConst[38],
	token += MCConst[177],
	token += MCConst[28],
	token += MCConst[61],
	token += MCConst[57],
	token += MCConst[14],
	token += MCConst[81],
	token += MCConst[113],
	token += MCConst[112],
	token += input2[5],
	token += input1[6],
	token += MCConst[20],
	token += MCConst[83],
	token += MCConst[72],
	token += MCConst[25],
	token += MCConst[162],
	token += MCConst[52],
	token += MCConst[4],
	token += MCConst[169],
	token += MCConst[55],
	token += MCConst[29],
	token += MCConst[48],
	token += MCConst[75],
	token += MCConst[66],
	token += MCConst[163],
	token += input2[15],
	token += MCConst[64],
	token += MCConst[186],
	token += MCConst[5],
	token += MCConst[140],
	token += MCConst[34],
	token += MCConst[118],
	token += MCConst[116],
	token += MCConst[35],
	token += MCConst[4],
	token += MCConst[135],
	token += MCConst[42],
	token += MCConst[73],
	token += MCConst[41],
	token += MCConst[69],
	token += MCConst[3],
	token += MCConst[106],
	token += MCConst[172],
	token += MCConst[91],
	token += MCConst[167],
	token += MCConst[185],
	token += MCConst[77],
	token += MCConst[142],
	token += MCConst[26],
	token += MCConst[110],
	token += MCConst[54],
	token += MCConst[102],
	token += MCConst[17],
	token += MCConst[165],
	token += MCConst[80],
	token += MCConst[181],
	token += MCConst[13],
	token += MCConst[183],
	token += MCConst[53],
	token += MCConst[8],
	token += MCConst[174],
	token += MCConst[90],
	token += MCConst[137],
	token += MCConst[108],
	token += MCConst[18],
	token += input2[19],
	token += MCConst[33],
	token += MCConst[0],
	token += MCConst[70],
	token += MCConst[47],
	token += MCConst[7],
	token += MCConst[158],
	token += MCConst[59],
	token += input1[4],
	token += input1[5],
	token += MCConst[95],
	token += input1[3],
	token += MCConst[84],
	token += MCConst[21],
	token += input1[8],
	token += MCConst[14],
	token += MCConst[50],
	token += MCConst[148],
	token += MCConst[37],
	token += MCConst[159],
	token += MCConst[71],
	token += MCConst[8],
	token += MCConst[3],
	token += input1[16],
	token += MCConst[98],
	token += MCConst[103],
	token += MCConst[121],
	token += input2[1],
	token += input1[9],
	token += MCConst[170],
	token += MCConst[56],
	token += MCConst[18],
	token += input2[2],
	token += MCConst[139],
	token += MCConst[0],
	token += MCConst[99],
	token += MCConst[109],
	token += MCConst[136],
	token += MCConst[46],
	token += MCConst[2],
	token += MCConst[126],
	token += MCConst[15],
	token += MCConst[63],
	token += MCConst[157],
	token += MCConst[180],
	token += MCConst[138],
	token += MCConst[19],
	token += MCConst[49],
	token += MCConst[175],
	token += MCConst[141],
	token += MCConst[152],
	token += input2[11],
	token += input1[18],
	token += MCConst[144],
	token += input1[17],
	token += MCConst[12],
	token += MCConst[101],
	token += MCConst[60],
	token += MCConst[149],
	token += MCConst[10],
	token += MCConst[1],
	token += MCConst[92],
	token += MCConst[150],
	token;
};

/**
 * DEPRECATED: This function is no longer used for socialId computation.
 * The correct algorithm uses login response's `whamm` field, computed in tampermonkey.js.
 * - Input: `whamm` (21-char string from login response, NOT from 3PSIDMC)
 * - Algorithm: hashCode(whamm) → index → [1,2,...,29][index]
 * - Source: Official bundle ju7fs.main.a3ef6281.js (offsets 1290814, 308842, 325310)
 * This function is kept for potential future use or other hashCode needs (e.g. party code).
 * @param {string} socialWhamm - Base string
 * @param {number} start - Starting index
 * @param {number} length - Max index
 * @returns {number}
*/
function getRandomEntry(socialWhamm, start, length) {
	let result = 0, i = 0;
	if (socialWhamm.length > 0) {
		for (; i < socialWhamm.length; ) {
			result = (result << 5) - result + socialWhamm.charCodeAt(i++) | 0;
		}
	}
	return Math.abs(result) % (length - start) + start;
};

/**
 * Sends a post request to generate the 3PSIDMCPP token.
 * @param {string} expired - Regenerate the trafficCode
*/
async function gen3PSIDMCPP(expired) {
	let data = await fetch('https://bloxd.io/index/metrics/cookies', {
		method: 'POST',
		headers: {
			'Cookie': `___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}; bloxd={"bedwars_solo":{}}`,
			...HEADERS
		},
		body: JSON.stringify({
			metricsCookies: exports.metrics
		})
	}).catch((err) => console.log(err));

	if (data.ok) {
		const setCookieHeader = data.headers.get('set-cookie');
		const parsedCookies = parseSetCookie(setCookieHeader);
		Object.assign(exports.cookies, parsedCookies);
		data = await data.json();
		exports.metrics['3PSIDMCPP'] = data['3PSIDMCPP'];
		exports.user.name = data.name;
		console.log(`\x1b[36m[*] Logged in as ${data.name}\x1b[0m`);
	} else {
		if (data.status == 420) {
			console.log(`\x1b[36m[*] Outdated version or unauthorized, please wait for an update!\x1b[0m`);
			return;
		}
		console.log(`\x1b[36m[*] Failed to log in : ${data.status}\x1b[0m`);
		return;
	}

	if (expired) {
		await startWebSocketLogic();
		lSocket.send('request');
		data = await fetch('https://bloxd.io/index/traffic-code', {
			method: 'POST',
			headers: {
				'Cookie': `___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}`,
				...HEADERS
			},
			body: JSON.stringify({
				contents: {
					x: {
						a: await new Promise(resolve => {promise = resolve})
					}
				},
				metricsCookies: exports.metrics
			})
		});

		if (data.ok) {
			data = await data.json();
			exports.matchmaking.trafficCode = data.trafficCode;
			console.log(`\x1b[36m[*] Generated traffic token!\x1b[0m`);
		} else {
			console.log(`\x1b[36m[*] Failed to generate traffic token : ${data.status}\x1b[0m`);
			return;
		}

		fs.writeFileSync(LOGIN_PATH, JSON.stringify({
			'3PSIDMC': exports.metrics['3PSIDMC'],
			trafficCode: exports.matchmaking.trafficCode,
			expireTime: Date.now() + 6048e5,
			cookies: exports.cookies
		}));
	}
};

/**
 * Starts the local websocket server (non-blocking, idempotent) for the browser to pass tokens and proxy matchmake requests.
*/
function startWebSocketServer() {
	if (wsServerStarted) return;
	wsServerStarted = true;
	const wsServer = new ws.Server({
		port: 6874
	});

	wsServer.on('connection', function(socket) {
		if (lSocket != undefined) {
			socket.terminate();
			return;
		}
		lSocket = socket;
		console.log(`\x1b[36m[*] Tampermonkey script connected.\x1b[0m`);

		socket.on('message', function(msg) {
			const msgStr = msg.toString('utf8');
			// Try parsing as JSON (matchmake proxy response)
			if (msgStr.startsWith('{')) {
				try {
					const parsed = JSON.parse(msgStr);
					if (parsed.type === 'matchmake' && parsed.id && matchmakeResolvers[parsed.id]) {
						matchmakeResolvers[parsed.id](parsed);
						delete matchmakeResolvers[parsed.id];
						return;
					}
				} catch (e) { /* not a valid JSON message */ }
			}
			// Otherwise, turnstile token (existing logic)
			if (promise) {
				promise(msgStr);
				promise = undefined;
			}
		});

		socket.on('close', function() {
			lSocket = undefined;
			console.log(`\x1b[36m[*] Tampermonkey script disconnected.\x1b[0m`);
		});
	});

	wsServer.on('error', (err) => {
		console.log(`\x1b[36m[*] WebSocket server error: ${err.message}\x1b[0m`);
	});
	console.log(`\x1b[36m[*] WebSocket server listening on port 6874, waiting for Tampermonkey script...\x1b[0m`);
};

/**
 * Starts the websocket server and waits for the Tampermonkey script to connect.
 * Used when trafficCode is expired and a turnstile token is needed.
*/
async function startWebSocketLogic() {
	console.log(`\x1b[36m[*] Expired trafficCode, please load up the tampermonkey script to continue.\x1b[0m`);
	startWebSocketServer();
	await new Promise((resolve) => {
		let loop;
		loop = setInterval(() => {
			if (lSocket != undefined) {
				clearInterval(loop);
				resolve();
			}
		}, 10);
	});
};

function loadSettings() {
	if (fs.existsSync(SETTINGS_PATH)) {
		for (const [name, val] of Object.entries(JSON.parse(fs.readFileSync(SETTINGS_PATH, { encoding: 'utf-8' })))) {
			exports.settings[name] = val;
		}
	} else {
		exports.saveSettings();
	}
}

/**
 * Reads login.json to grab the current 3PSIDMC and trafficCode.
*/
exports.checkLogin = async function() {
	let expired = true;
	if (fs.existsSync(LOGIN_PATH)) {
		const loginData = JSON.parse(fs.readFileSync(LOGIN_PATH, { encoding: 'utf-8' }));
		exports.metrics['3PSIDMC'] = loginData['3PSIDMC'];
		exports.matchmaking.trafficCode = loginData.trafficCode;
		exports.cookies = loginData.cookies ?? {};
		expired = loginData.expireTime <= Date.now();
	} else {
		console.log(`\x1b[36m[*] Login not found, using a random 3PSIDMC token.\x1b[0m`);
	}

	// NOTE: socialId is now computed in tampermonkey.js from login response's whamm field.
	// This fallback is only used when Tampermonkey is not connected.
	// We keep a placeholder value (1) since Node fetch will get 400 from TLS fingerprint anyway.
	// Correct algorithm: socialId = [1,2,...,29][hashCode(whamm) % 29]
	// Source: Official bundle ju7fs.main.a3ef6281.js (offsets 1290814, 308842, 325310)
	socialId = 1;

	await gen3PSIDMCPP(expired);
	startWebSocketServer();
	loadSettings();
};

exports.saveSettings = function() {
	fs.writeFileSync(SETTINGS_PATH, JSON.stringify(exports.settings));
};

/**
 * Sends a post request to the desginated social url.
 * Uses JSON format matching the official Bloxd client (Yw → mv with Ew.json).
 * For bloxd-matchmake, routes through the Tampermonkey browser proxy to bypass Cloudflare TLS fingerprint detection.
 * @param {string} url - POST Endpoint
 * @param {object} data - Content Data
*/
exports.socialRequest = async function(url, data) {
	const fullUrl = url.includes('bloxd.io') ? url : `https://social${socialId}.bloxd.io/social/${url}`;
	const body = {metricsCookies: exports.metrics};
	if (data && Object.keys(data).length > 0) {
		body.contents = data;
	}

	// Route matchmake through Tampermonkey browser proxy (bypasses Cloudflare TLS fingerprint detection)
	if (url.includes('bloxd-matchmake') && lSocket) {
		console.log(`\x1b[36m[*] Routing matchmake through browser proxy (Tampermonkey connected)\x1b[0m`);
		const id = `mm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		const responsePromise = new Promise((resolve) => {
			matchmakeResolvers[id] = resolve;
		});
		lSocket.send(JSON.stringify({
			type: 'matchmake',
			id: id,
			gameNameWithVariation: data?.gameNameWithVariation,
			languages: data?.languages,
			sp: exports.metrics['3PSIDMCSP']
		}));
		// Timeout: if no response in 30s, the Tampermonkey script likely doesn't handle matchmake
		const timeoutHandle = setTimeout(() => {
			if (matchmakeResolvers[id]) {
				console.log(`\x1b[33m[!] Matchmake proxy timeout (30s) — Tampermonkey script may be outdated or fetch hung\x1b[0m`);
				matchmakeResolvers[id]({error: 'Proxy timeout: no response from Tampermonkey script in 30s. Please update the script and refresh bloxd.io.', status: 0, body: ''});
				delete matchmakeResolvers[id];
			}
		}, 30000);
		const result = await responsePromise;
		clearTimeout(timeoutHandle);
		if (result.error) {
			throw new Error(result.error);
		}
		// Update user name from browser's real account
		if (result.loginName) {
			exports.user.name = result.loginName;
		}
		console.log(`\x1b[36m[*] Matchmake proxy response: status=${result.status}\x1b[0m`);
		return {
			ok: result.status >= 200 && result.status < 300,
			status: result.status,
			statusText: result.status === 200 ? 'OK' : (result.status === 400 ? 'Bad Request' : (result.status === 401 ? 'Unauthorized' : '')),
			text: async () => result.body,
			json: async () => JSON.parse(result.body)
		};
	}

	if (url.includes('bloxd-matchmake')) {
		console.log(`\x1b[33m[!] Tampermonkey not connected — falling back to Node fetch (will likely get 400 from TLS fingerprint)\x1b[0m`);
	}
	return await fetch(fullUrl, {
		method: 'POST',
		headers: {
			...HEADERS,
			'Cookie': buildCookieHeader()
		},
		body: JSON.stringify(body)
	});
};

exports.gen3PSIDMCPP = gen3PSIDMCPP;
exports.genString = genString;
exports.isTampermonkeyConnected = function() { return lSocket !== undefined; };
exports.waitForTampermonkey = function(timeout = 30000) {
	return new Promise((resolve) => {
		if (lSocket) return resolve(true);
		const startTime = Date.now();
		const loop = setInterval(() => {
			if (lSocket) {
				clearInterval(loop);
				resolve(true);
			} else if (Date.now() - startTime > timeout) {
				clearInterval(loop);
				resolve(false);
			}
		}, 100);
	});
};
exports.version = 761;
exports.languages = ['en-US', 'en', require('./anticheat_constants.js').LANGUAGE_KEY];
exports.browser = {
	ua: HEADERS['User-Agent'],
	name: 'Firefox',
	version: '140.0',
	platform: 'Win32',
	platformType: 'desktop',
	deviceType: 'hybrid'
};

exports.metrics = {
	'1PAPISID': 'N/A',
	'1PSID': 'N/A',
	'3PAPISID': 'N/A',
	'3PSID': 'N/A',
	'3PSIDMC': gen3PSIDMC(genString(), genString(), genString()),
	'3PSIDMCPP': 'N/A',
	'3PSIDMCSP': gen3PSIDMCSP(addPadding(exports.version))
};

exports.matchmaking = {
	trafficCode: '',
	compliance: genCompliance('bloxd') + '_' + genCompliance('bloxd') + '_non-eu_secure=true'
};

exports.user = {
	name: ''
};

exports.cookies = {};

exports.settings = {
	server_name: 'Bloxd',
	autoNameChange: false,
	nameChangeTime: 0
};