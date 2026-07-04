// ==UserScript==
// @name         BloxdCommunication
// @namespace    http://7granddadpgn.github.io
// @version      2026-07-03o
// @description  Generate tokens + proxy matchmake using whamm from login response
// @author       7GrandDad
// @match        https://bloxd.io/*
// @icon         https://bloxd.io/favicon.png
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

async function getTurnstileToken() {
    return new Promise(resolve => {
        unsafeWindow.turnstile.render("#arthurisstupid", {
            sitekey: "0x4AAAAAAAa4cz8QxEw-M2SE",
            theme: "dark",
            action: "Greenlight",
            retry: "never",
            "refresh-expired": "never",
            callback: function(token) {
                if (this.wrapper) this.wrapper.remove();
                resolve(token);
            }
        });
    });
}

(async function() {
	'use strict';
	const screen = document.createElement('div');
	screen.id = 'arthurisstupid';
	screen.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999; pointer-events: none";
	const status = document.createElement('h');
	status.textContent = 'Bloxd Communication Script Status: Not Connected';
	status.style = "font-size: 2.2em; color: #FFF";
	screen.appendChild(status);

    // https://stackoverflow.com/questions/22141205/intercept-and-alter-a-sites-javascript-using-greasemonkey
    if(navigator.userAgent.indexOf("Firefox") != -1) {
        window.addEventListener("beforescriptexecute", function(e) {
            if(!(e.target.src.startsWith('https://challenges.cloudflare.com/turnstile/'))) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, false);
    } else {
        new MutationObserver(async (mutations, observer) => {
            let oldScript = mutations
                .flatMap(e => [...e.addedNodes])
                .filter(e => e.tagName == 'SCRIPT');

            for (const script of oldScript) {
                if (!(script.src.startsWith('https://challenges.cloudflare.com/turnstile/'))) script.type = 'javascript/blocked';
            }
        }).observe(document, {
            childList: true,
            subtree: true,
        });
    }

    const scr = document.createElement('script');
    scr.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded';
    document.head.appendChild(scr);

	await new Promise(resolve => {
		unsafeWindow.onTurnstileLoaded = resolve;
	});

	// INJECT page-context helper script
	// This runs in the page's real context, so window.fetch uses Chrome's BoringSSL (bypasses TLS fingerprint)
	// and the browser auto-adds Origin, Referer, sec-ch-ua, sec-fetch-* headers.
	const helperScript = document.createElement('script');
	helperScript.textContent = `
		/**
		 * DEPRECATED: hashCode helper. No longer used for socialId (uses login response's whamm now).
		 * Kept for potential future use or other hashCode needs.
		 */
		function __hashCodeDeprecated(str, start, length) {
			let result = 0, i = 0;
			if (str.length > 0) {
				for (; i < str.length;) {
					result = (result << 5) - result + str.charCodeAt(i++) | 0;
				}
			}
			return Math.abs(result) % (length - start) + start;
		}

		/**
		 * CORRECT ALGORITHM: Compute socialId from login response's whamm field.
		 * Source: Official bundle ju7fs.main.a3ef6281.js
		 * - hashCode: Java String.hashCode (multiply 31, <<5 pattern)
		 * - socialServerPortsKeys: [1, 2, ..., 29] (29 social servers)
		 * - socialId = keys[Math.abs(hash) % 29]
		 */
		function __computeSocialIdFromWhamm(whamm) {
			// hashCode: Java String.hashCode (multiply 31)
			let hash = 0, i = 0;
			if (whamm.length > 0) {
				for (; i < whamm.length;) {
					hash = (hash << 5) - hash + whamm.charCodeAt(i++) | 0;
				}
			}
			// socialServerPortsKeys = [1, 2, ..., 29] (from bundle offset 308842)
			const keys = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29];
			// index = Math.abs(hash) % 29 (range: 0-28)
			// socialId = keys[index] (range: 1-29)
			return keys[Math.abs(hash) % keys.length];
		}

		window.__bloxdProxyHelper = {
			// Full matchmake flow: login → extract whamm → compute socialId → matchmake
			doMatchmake: function(gameNameWithVariation, languages, sp, callback) {
				var log = function() {
					var args = Array.prototype.slice.call(arguments);
					args.unshift('[BloxdProxy]');
					console.log.apply(console, args);
				};

				log('Starting matchmake flow (v2026-07-03o)...');

				// Step 1: Read real 3PSIDMC from browser cookie
				var mcMatch = document.cookie.match(/___Secure-3PSIDMC=([^;]+)/);
				if (!mcMatch) {
					callback({error: 'No ___Secure-3PSIDMC cookie found. Please log in to bloxd.io.'});
					return;
				}
				var mc = mcMatch[1];
				log('Browser 3PSIDMC:', mc.substring(0, 30) + '...');

				// Step 2: Login to get fresh 3PSIDMCPP and whamm
				var loginMetrics = {
					'1PAPISID': 'N/A', '1PSID': 'N/A', '3PAPISID': 'N/A', '3PSID': 'N/A',
					'3PSIDMC': mc, '3PSIDMCPP': 'N/A', '3PSIDMCSP': sp
				};

				fetch('https://bloxd.io/index/metrics/cookies', {
					method: 'POST',
					headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
					body: JSON.stringify({metricsCookies: loginMetrics})
				}).then(function(resp) {
					log('Login response:', resp.status);
					if (!resp.ok) {
						return resp.text().then(function(body) {
							callback({error: 'Login failed (' + resp.status + '): ' + body.substring(0, 200), status: resp.status, body: body});
							throw new Error('Login failed');
						});
					}
					return resp.json();
				}).then(function(loginData) {
					if (!loginData) return;

					// Step 3: Extract whamm from login response (KEY FIX)
					var whamm = loginData.whamm;
					if (!whamm) {
						callback({error: 'Login response missing whamm field. Server API may have changed.'});
						return;
					}
					log('Login OK, name=' + loginData.name + ', whamm=' + whamm.substring(0, 15) + '..., got 3PSIDMCPP:', loginData['3PSIDMCPP'].substring(0, 30) + '...');

					// Step 4: Compute correct socialId from whamm (KEY FIX)
					var socialId = __computeSocialIdFromWhamm(whamm);
					var matchmakeUrl = 'https://social' + socialId + '.bloxd.io/social/bloxd-matchmake';
					log('Computed socialId from whamm:', socialId);
					log('Matchmake URL:', matchmakeUrl);

					// Step 5: Build matchmake body with matching credentials
					var matchmakeMetrics = {
						'1PAPISID': 'N/A', '1PSID': 'N/A', '3PAPISID': 'N/A', '3PSID': 'N/A',
						'3PSIDMC': mc, '3PSIDMCPP': loginData['3PSIDMCPP'], '3PSIDMCSP': sp
					};
					var mmBody = JSON.stringify({
						metricsCookies: matchmakeMetrics,
						contents: {gameNameWithVariation: gameNameWithVariation, languages: languages}
					});
					log('Matchmake body:', mmBody.substring(0, 300));

					// Step 6: Send matchmake via page-context fetch (browser TLS + headers)
					return fetch(matchmakeUrl, {
						method: 'POST',
						headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
						body: mmBody
					}).then(function(mmResp) {
						return mmResp.text().then(function(mmRespBody) {
							log('Matchmake response:', mmResp.status, mmRespBody.substring(0, 300));
							callback({
								status: mmResp.status,
								body: mmRespBody,
								loginName: loginData.name,
								socialId: socialId,
								matchmakeUrl: matchmakeUrl,
								sentBody: mmBody,
								whamm: whamm
							});
						});
					});
				}).catch(function(err) {
					log('Error:', err.message);
					if (err.message !== 'Login failed') {
						callback({error: err.message, stack: err.stack ? String(err.stack) : ''});
					}
				});
			}
		};
		console.log('[BloxdProxy] Helper initialized (v2026-07-03o, USE WHAMM FROM LOGIN)');
	`;
	document.head.appendChild(helperScript);

	// Wait for helper to be ready
	await new Promise(resolve => {
		const check = setInterval(() => {
			if (unsafeWindow.__bloxdProxyHelper) {
				clearInterval(check);
				resolve();
			}
		}, 100);
	});
	console.log('[BloxdComm] Page-context helper ready');

    const web = new window.WebSocket('ws://localhost:6874');
	web.onmessage = async (event) => {
		if (event.data.startsWith('request')) {
			status.textContent = 'Bloxd Communication Script Status: Generating token...';
            const token = await getTurnstileToken();
			web.send(token);
			status.textContent = 'Bloxd Communication Script Status: Sent!';
		} else if (event.data.startsWith('{')) {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === 'matchmake') {
					status.textContent = 'Bloxd Communication Script Status: Matchmaking...';
					console.log('[BloxdComm] Matchmake request from Node:', msg);

					// Use page-context helper to do full matchmake flow (login + matchmake)
					unsafeWindow.__bloxdProxyHelper.doMatchmake(
						msg.gameNameWithVariation,
						msg.languages,
						msg.sp,
						function(result) {
							console.log('[BloxdComm] Matchmake result:', result.status || 'error', result.error || '');
							if (result.socialId) {
								console.log('[BloxdComm] Used socialId:', result.socialId, 'URL:', result.matchmakeUrl);
							}
							console.log('[BloxdComm] >>> SENT BODY:', result.sentBody ? result.sentBody.substring(0, 400) : '');
							console.log('[BloxdComm] >>> RESPONSE BODY:', result.body ? result.body.substring(0, 300) : '');

							web.send(JSON.stringify({
								type: 'matchmake',
								id: msg.id,
								status: result.status || 0,
								body: result.body || '',
								error: result.error || undefined,
								loginName: result.loginName || undefined,
								socialId: result.socialId || undefined
							}));
							status.textContent = 'Bloxd Communication Script Status: Matchmade! (status=' + (result.status || 0) + ')';
						}
					);
				}
			} catch (e) {
				console.error('[BloxdComm] Error:', e);
			}
		}
	};

	web.onopen = async (event) => {
		status.textContent = 'Bloxd Communication Script Status: Connected! (v2026-07-03o)';
		console.log('[BloxdComm] WebSocket connected, script version 2026-07-03o (USE WHAMM FROM LOGIN)');
	};

	web.onclose = async (event) => {
		status.textContent = 'Bloxd Communication Script Status: Not Connected';
	};

	document.body.appendChild(screen);
})();
