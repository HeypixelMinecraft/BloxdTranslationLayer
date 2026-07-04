// ==UserScript==
// @name         BloxdSniff (TEMPORARY - no game blocking)
// @namespace    http://7granddadpgn.github.io
// @version      2026-07-03-sniff
// @description  Sniff-only script: does NOT block game scripts, only captures matchmake requests
// @author       7GrandDad
// @match        https://bloxd.io/*
// @icon         https://bloxd.io/favicon.png
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(async function() {
	'use strict';

	// SNIFFER: Install as early as possible to catch all fetch calls
	const origFetch = unsafeWindow.fetch;
	unsafeWindow.fetch = function(...args) {
		const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
		if (url && (url.includes('bloxd-matchmake') || url.includes('metrics/cookies') || url.includes('traffic-code'))) {
			const opts = args[1] || {};
			console.log('[SNIFF] fetch', url, {
				method: opts.method,
				headers: opts.headers,
				body: opts.body,
				credentials: opts.credentials
			});
			if (url.includes('bloxd-matchmake') && opts.body) {
				unsafeWindow.__lastMatchmakeBody = opts.body;
				unsafeWindow.__lastMatchmakeUrl = url;
				// Also store in localStorage for persistence
				try { localStorage.setItem('__sniffedMatchmake', opts.body); } catch(e) {}
			}
		}
		return origFetch.apply(this, args);
	};
	console.log('[SNIFF] Fetch sniffer installed (no game blocking)');

	// Wait for DOM ready to add status indicator
	const showStatus = () => {
		const status = document.createElement('div');
		status.style = "position: fixed; top: 0; right: 0; background: rgba(0,0,0,0.8); color: #0F0; padding: 8px; font-size: 14px; z-index: 99999; font-family: monospace; pointer-events: none";
		status.textContent = '[SNIFF v2026-07-03-sniff] Active - click Play to capture matchmake';
		document.body.appendChild(status);
	};
	if (document.body) showStatus();
	else document.addEventListener('DOMContentLoaded', showStatus);
})();
