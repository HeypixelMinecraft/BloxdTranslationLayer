// ==UserScript==
// @name         BloxdCommunication
// @namespace    http://7granddadpgn.github.io
// @version      2026-07-04b
// @description  Generate tokens + proxy matchmake by replaying the browser's official matchmake template
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

	const SCRIPT_VERSION = '2026-07-04b';
	const MATCHMAKE_TEMPLATE_ERROR = 'No captured Bloxd matchmake template yet. Open bloxd.io, click Play once in the website, then connect from Minecraft again.';
	let lastMatchmakeTemplate = null;

	function safeJsonParse(value) {
		try {
			return JSON.parse(value);
		} catch (err) {
			return null;
		}
	}

	function clonePlain(value) {
		return value == null ? value : JSON.parse(JSON.stringify(value));
	}

	function headersToObject(headers) {
		if (!headers) return undefined;
		try {
			if (headers instanceof Headers) return Object.fromEntries(headers.entries());
			if (Array.isArray(headers)) return Object.fromEntries(headers);
			if (typeof headers === 'object') return Object.assign({}, headers);
		} catch (err) {}
		return undefined;
	}

	function redactToken(value) {
		if (typeof value != 'string' || value.length <= 12) return '<redacted>';
		return value.substring(0, 6) + '...' + value.substring(value.length - 4);
	}

	function redactBody(body) {
		const clone = clonePlain(body);
		if (clone && clone.metricsCookies) {
			for (const key of Object.keys(clone.metricsCookies)) {
				if (key.includes('PSID')) {
					clone.metricsCookies[key] = redactToken(clone.metricsCookies[key]);
				}
			}
		}
		return clone;
	}

	function extractRequestOptions(args) {
		const input = args[0];
		const opts = args[1] || {};
		const requestLike = input && typeof input === 'object' && 'url' in input ? input : null;
		return {
			method: opts.method || (requestLike && requestLike.method) || 'POST',
			headers: headersToObject(opts.headers || (requestLike && requestLike.headers)),
			credentials: opts.credentials || (requestLike && requestLike.credentials) || undefined,
			mode: opts.mode || (requestLike && requestLike.mode) || undefined,
			cache: opts.cache || (requestLike && requestLike.cache) || undefined,
			redirect: opts.redirect || (requestLike && requestLike.redirect) || undefined,
			referrer: opts.referrer || (requestLike && requestLike.referrer) || undefined,
			referrerPolicy: opts.referrerPolicy || (requestLike && requestLike.referrerPolicy) || undefined,
			integrity: opts.integrity || (requestLike && requestLike.integrity) || undefined,
			keepalive: opts.keepalive || (requestLike && requestLike.keepalive) || undefined
		};
	}

	function captureMatchmakeTemplate(url, bodyText, options) {
		if (unsafeWindow.__bloxdProxyMatchmakeInFlight) return;
		const body = safeJsonParse(bodyText);
		if (!body || !body.metricsCookies || !body.contents) return;
		lastMatchmakeTemplate = {
			source: 'userscript',
			url: url,
			body: body,
			options: options || {},
			capturedAt: Date.now()
		};
		console.log('[BloxdComm] Captured official matchmake template:', {
			url: url,
			languages: body.contents.languages,
			contentFields: Object.keys(body.contents),
			optionFields: Object.keys(lastMatchmakeTemplate.options || {})
		});
	}

	const originalFetch = unsafeWindow.fetch;
	unsafeWindow.fetch = function(...args) {
		const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
		const opts = args[1] || {};
		if (url && url.includes('bloxd-matchmake') && !unsafeWindow.__bloxdProxyMatchmakeInFlight) {
			const options = extractRequestOptions(args);
			if (typeof opts.body === 'string') {
				captureMatchmakeTemplate(url, opts.body, options);
			} else if (opts.body && typeof opts.body.clone === 'function') {
				opts.body.clone().text().then(bodyText => captureMatchmakeTemplate(url, bodyText, options)).catch(() => {});
			} else if (args[0] && typeof args[0].clone === 'function') {
				args[0].clone().text().then(bodyText => captureMatchmakeTemplate(url, bodyText, options)).catch(() => {});
			}
		}
		return originalFetch.apply(this, args);
	};
	unsafeWindow.__bloxdGetMatchmakeTemplate = function() {
		return lastMatchmakeTemplate ? clonePlain(lastMatchmakeTemplate) : null;
	};

	const pageSnifferScript = document.createElement('script');
	pageSnifferScript.textContent = `
		(function() {
			if (window.__bloxdMatchmakeSnifferInstalled) return;
			window.__bloxdMatchmakeSnifferInstalled = true;
			const originalFetch = window.fetch;

			function headersToObject(headers) {
				if (!headers) return undefined;
				try {
					if (headers instanceof Headers) return Object.fromEntries(headers.entries());
					if (Array.isArray(headers)) return Object.fromEntries(headers);
					if (typeof headers === 'object') return Object.assign({}, headers);
				} catch (err) {}
				return undefined;
			}

			function extractRequestOptions(args) {
				const input = args[0];
				const opts = args[1] || {};
				const requestLike = input && typeof input === 'object' && 'url' in input ? input : null;
				return {
					method: opts.method || (requestLike && requestLike.method) || 'POST',
					headers: headersToObject(opts.headers || (requestLike && requestLike.headers)),
					credentials: opts.credentials || (requestLike && requestLike.credentials) || undefined,
					mode: opts.mode || (requestLike && requestLike.mode) || undefined,
					cache: opts.cache || (requestLike && requestLike.cache) || undefined,
					redirect: opts.redirect || (requestLike && requestLike.redirect) || undefined,
					referrer: opts.referrer || (requestLike && requestLike.referrer) || undefined,
					referrerPolicy: opts.referrerPolicy || (requestLike && requestLike.referrerPolicy) || undefined,
					integrity: opts.integrity || (requestLike && requestLike.integrity) || undefined,
					keepalive: opts.keepalive || (requestLike && requestLike.keepalive) || undefined
				};
			}

			function capture(url, bodyText, options) {
				if (window.__bloxdProxyMatchmakeInFlight) return;
				try {
					const body = JSON.parse(bodyText);
					if (!body || !body.metricsCookies || !body.contents) return;
					window.__bloxdLastMatchmakeTemplate = {
						source: 'page',
						url: url,
						body: body,
						options: options || {},
						capturedAt: Date.now()
					};
					console.log('[BloxdProxy] Captured official matchmake template in page context:', {
						url: url,
						languages: body.contents.languages,
						contentFields: Object.keys(body.contents),
						optionFields: Object.keys(options || {})
					});
				} catch (err) {}
			}

			window.fetch = function(...args) {
				const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
				const opts = args[1] || {};
				if (url && url.includes('bloxd-matchmake') && !window.__bloxdProxyMatchmakeInFlight) {
					const options = extractRequestOptions(args);
					if (typeof opts.body === 'string') {
						capture(url, opts.body, options);
					} else if (opts.body && typeof opts.body.clone === 'function') {
						opts.body.clone().text().then(bodyText => capture(url, bodyText, options)).catch(() => {});
					} else if (args[0] && typeof args[0].clone === 'function') {
						args[0].clone().text().then(bodyText => capture(url, bodyText, options)).catch(() => {});
					}
				}
				return originalFetch.apply(this, args);
			};
		})();
	`;
	(document.head || document.documentElement).appendChild(pageSnifferScript);

	const screen = document.createElement('div');
	screen.id = 'arthurisstupid';
	screen.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999; pointer-events: none";
	const status = document.createElement('h');
	status.textContent = 'Bloxd Communication Script Status: Not Connected';
	status.style = "font-size: 2.2em; color: #FFF";
	screen.appendChild(status);

	const scr = document.createElement('script');
	scr.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded';
	document.head.appendChild(scr);

	await new Promise(resolve => {
		unsafeWindow.onTurnstileLoaded = resolve;
	});

	const helperScript = document.createElement('script');
	helperScript.textContent = `
		const __BLOXD_PROXY_VERSION = '2026-07-04b';
		const __BLOXD_TEMPLATE_ERROR = 'No captured Bloxd matchmake template yet. Open bloxd.io, click Play once in the website, then connect from Minecraft again.';

		function __clonePlain(value) {
			return value == null ? value : JSON.parse(JSON.stringify(value));
		}

		function __redactToken(value) {
			if (typeof value != 'string' || value.length <= 12) return '<redacted>';
			return value.substring(0, 6) + '...' + value.substring(value.length - 4);
		}

		function __redactBody(body) {
			const clone = __clonePlain(body);
			if (clone && clone.metricsCookies) {
				for (const key of Object.keys(clone.metricsCookies)) {
					if (key.includes('PSID')) {
						clone.metricsCookies[key] = __redactToken(clone.metricsCookies[key]);
					}
				}
			}
			return clone;
		}

		function __extractSocialId(url) {
			const match = String(url || '').match(/https:\\/\\/social(\\d+)\\.bloxd\\.io\\//);
			return match ? Number(match[1]) : undefined;
		}

		function __buildReplayOptions(template, bodyText) {
			const source = template.options || {};
			const options = {};
			for (const key of ['method', 'headers', 'credentials', 'mode', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive']) {
				if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
					options[key] = source[key];
				}
			}
			options.method = options.method || 'POST';
			options.headers = Object.assign({}, options.headers || {}, {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			});
			options.body = bodyText;
			return options;
		}

		window.__bloxdProxyHelper = {
			doMatchmake: function(contents, callback) {
				var log = function() {
					var args = Array.prototype.slice.call(arguments);
					args.unshift('[BloxdProxy]');
					console.log.apply(console, args);
				};

				log('Starting strict matchmake replay (v' + __BLOXD_PROXY_VERSION + ')...');

				const capturedTemplate = window.__bloxdLastMatchmakeTemplate || (window.__bloxdGetMatchmakeTemplate && window.__bloxdGetMatchmakeTemplate());
				if (!capturedTemplate || !capturedTemplate.url || !capturedTemplate.body || !capturedTemplate.body.contents) {
					callback({error: __BLOXD_TEMPLATE_ERROR, status: 0, body: ''});
					return;
				}

				var matchmakeUrl = capturedTemplate.url;
				var socialId = __extractSocialId(matchmakeUrl);
				var matchmakeBody = __clonePlain(capturedTemplate.body);
				var incoming = contents || {};
				if (incoming.gameNameWithVariation) {
					matchmakeBody.contents.gameNameWithVariation = incoming.gameNameWithVariation;
				}
				if (incoming.lobbyNameOrDiscordContext) {
					matchmakeBody.contents.lobbyNameOrDiscordContext = incoming.lobbyNameOrDiscordContext;
				} else {
					delete matchmakeBody.contents.lobbyNameOrDiscordContext;
				}

				var mmBody = JSON.stringify(matchmakeBody);
				var replayOptions = __buildReplayOptions(capturedTemplate, mmBody);
				log('Template source:', capturedTemplate.source || 'unknown', 'capturedAt:', new Date(capturedTemplate.capturedAt || Date.now()).toISOString());
				log('Matchmake URL:', matchmakeUrl);
				log('Template languages:', capturedTemplate.body.contents.languages);
				log('Final languages:', matchmakeBody.contents.languages);
				log('Replay option fields:', Object.keys(replayOptions).filter(key => key !== 'body'));
				log('Matchmake body:', JSON.stringify(__redactBody(matchmakeBody)).substring(0, 700));

				window.__bloxdProxyMatchmakeInFlight = true;
				return fetch(matchmakeUrl, replayOptions).then(function(mmResp) {
					return mmResp.text().then(function(mmRespBody) {
						log('Matchmake response:', mmResp.status, mmRespBody.substring(0, 300));
						callback({
							status: mmResp.status,
							body: mmRespBody,
							socialId: socialId,
							matchmakeUrl: matchmakeUrl,
							sentBody: JSON.stringify(__redactBody(matchmakeBody))
						});
					});
				}).catch(function(err) {
					log('Error:', err.message);
					callback({error: err.message, stack: err.stack ? String(err.stack) : ''});
				}).finally(function() {
					window.__bloxdProxyMatchmakeInFlight = false;
				});
			}
		};
		console.log('[BloxdProxy] Helper initialized (v' + __BLOXD_PROXY_VERSION + ', strict replay mode)');
	`;
	document.head.appendChild(helperScript);

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
					const hasPageTemplate = Boolean(unsafeWindow.__bloxdLastMatchmakeTemplate);
					status.textContent = 'Bloxd Communication Script Status: Matchmaking...';
					console.log('[BloxdComm] Matchmake request from Node:', {
						id: msg.id,
						contents: msg.contents,
						hasTemplate: Boolean(lastMatchmakeTemplate) || hasPageTemplate
					});

					unsafeWindow.__bloxdProxyHelper.doMatchmake(
						msg.contents || {
							gameNameWithVariation: msg.gameNameWithVariation,
							lobbyNameOrDiscordContext: msg.lobbyNameOrDiscordContext
						},
						function(result) {
							console.log('[BloxdComm] Matchmake result:', result.status || 'error', result.error || '');
							if (result.socialId) {
								console.log('[BloxdComm] Used socialId:', result.socialId, 'URL:', result.matchmakeUrl);
							}
							console.log('[BloxdComm] >>> SENT BODY:', result.sentBody ? result.sentBody.substring(0, 700) : '');
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

	web.onopen = async () => {
		status.textContent = 'Bloxd Communication Script Status: Connected! (v' + SCRIPT_VERSION + ')';
		console.log('[BloxdComm] WebSocket connected, script version ' + SCRIPT_VERSION + ' (strict replay mode)');
	};

	web.onclose = async () => {
		status.textContent = 'Bloxd Communication Script Status: Not Connected';
	};

	if (document.body) {
		document.body.appendChild(screen);
	} else {
		document.addEventListener('DOMContentLoaded', () => document.body.appendChild(screen), {once: true});
	}
})();
