import { BrowserWindow, WebContents } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { BloxdPageStatus, BloxdStatus } from '../shared/types';

type MatchmakeContents = {
  gameNameWithVariation?: string;
  lobbyNameOrDiscordContext?: string;
};

type MatchmakeResult = {
  status: number;
  body: string;
  socialId?: number;
  matchmakeUrl?: string;
  sentBody?: string;
  error?: string;
  loginName?: string;
};

export type BloxdLoginCookies = {
  token3PSIDMC?: string;
  cookies: Record<string, string>;
};

const DIAGNOSTICS_DIR = path.resolve(process.cwd(), 'diagnostics');

const INJECTED_PROXY = `
(function() {
  if (window.__bloxdCdpProxyInstalled) return;
  window.__bloxdCdpProxyInstalled = true;
  window.__bloxdCdpProxyMatchmakeInFlight = false;
  window.__bloxdCdpProxyStatus = {
    templateCaptured: false,
    capturedAt: undefined,
    lastError: undefined,
    inGameDetected: false,
    released: false,
    gameServerHost: undefined
  };

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch (err) { return null; }
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

  function redactToken(value) {
    if (typeof value !== 'string' || value.length <= 12) return '<redacted>';
    return value.substring(0, 6) + '...' + value.substring(value.length - 4);
  }

  function redactBody(body) {
    const clone = clonePlain(body);
    if (clone && clone.metricsCookies) {
      for (const key of Object.keys(clone.metricsCookies)) {
        if (key.includes('PSID')) clone.metricsCookies[key] = redactToken(clone.metricsCookies[key]);
      }
    }
    return clone;
  }

  function capture(url, bodyText, options) {
    if (window.__bloxdCdpProxyMatchmakeInFlight) return;
    const body = safeJsonParse(bodyText);
    if (!body || !body.metricsCookies || !body.contents) return;
    window.__bloxdCdpLastMatchmakeTemplate = {
      source: 'electron-cdp',
      url,
      body,
      options: options || {},
      capturedAt: Date.now()
    };
    window.__bloxdCdpProxyStatus = {
      templateCaptured: true,
      capturedAt: Date.now(),
      lastError: undefined
    };
    console.log('[BloxdCDP] Captured official matchmake template', {
      url,
      languages: body.contents.languages,
      contentFields: Object.keys(body.contents),
      optionFields: Object.keys(options || {})
    });
  }

  function markInGame(reason, url) {
    if (window.__bloxdCdpProxyStatus.inGameDetected) return;
    window.__bloxdCdpProxyStatus.inGameDetected = true;
    window.__bloxdCdpProxyStatus.inGameReason = reason;
    window.__bloxdCdpProxyStatus.inGameUrl = url;
    console.log('[BloxdCDP] Game page detected, releasing built-in Bloxd page to avoid duplicate session', { reason, url });
  }

  function isGameSocketUrl(url) {
    const text = String(url || '');
    const knownHost = window.__bloxdCdpProxyStatus.gameServerHost;
    return (text.includes('gs-') && text.includes('.bloxd.io')) || (knownHost && text.includes(knownHost));
  }

  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args) {
      if (isGameSocketUrl(args[0])) {
        markInGame('websocket', String(args[0]));
      }
      return Reflect.construct(target, args);
    },
    apply(target, thisArg, args) {
      if (isGameSocketUrl(args[0])) {
        markInGame('websocket', String(args[0]));
      }
      return Reflect.apply(target, thisArg, args);
    }
  });
  window.WebSocket.prototype = OriginalWebSocket.prototype;

  function extractSocialId(url) {
    const match = String(url || '').match(/https:\\/\\/social(\\d+)\\.bloxd\\.io\\//);
    return match ? Number(match[1]) : undefined;
  }

  function buildReplayOptions(template, bodyText) {
    const source = template.options || {};
    const options = {};
    for (const key of ['method', 'headers', 'credentials', 'mode', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive']) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
        options[key] = source[key];
      }
    }
    options.method = options.method || 'POST';
    options.headers = Object.assign({}, options.headers || {}, {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
    options.body = bodyText;
    return options;
  }

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
    const opts = args[1] || {};
    if (url && url.includes('bloxd-matchmake') && !window.__bloxdCdpProxyMatchmakeInFlight) {
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

  window.__bloxdCdpProxy = {
    getStatus() {
      return {
        templateCaptured: Boolean(window.__bloxdCdpLastMatchmakeTemplate),
        capturedAt: window.__bloxdCdpLastMatchmakeTemplate && window.__bloxdCdpLastMatchmakeTemplate.capturedAt,
        url: location.href,
        released: Boolean(window.__bloxdCdpProxyStatus.released),
        inGameDetected: Boolean(window.__bloxdCdpProxyStatus.inGameDetected),
        gameServerHost: window.__bloxdCdpProxyStatus.gameServerHost,
        lastError: window.__bloxdCdpProxyStatus.lastError
      };
    },
    async doMatchmake(contents) {
      const template = window.__bloxdCdpLastMatchmakeTemplate;
      if (!template || !template.url || !template.body || !template.body.contents) {
        return {
          error: 'No captured Bloxd matchmake template yet. Open the built-in Bloxd page and click Play once, then connect from Minecraft again.',
          status: 0,
          body: ''
        };
      }

      const matchmakeBody = clonePlain(template.body);
      const incoming = contents || {};
      if (incoming.gameNameWithVariation) {
        matchmakeBody.contents.gameNameWithVariation = incoming.gameNameWithVariation;
      }
      if (incoming.lobbyNameOrDiscordContext) {
        matchmakeBody.contents.lobbyNameOrDiscordContext = incoming.lobbyNameOrDiscordContext;
      } else {
        delete matchmakeBody.contents.lobbyNameOrDiscordContext;
      }

      const bodyText = JSON.stringify(matchmakeBody);
      const options = buildReplayOptions(template, bodyText);
      window.__bloxdCdpProxyMatchmakeInFlight = true;
      try {
        const response = await fetch(template.url, options);
        const responseBody = await response.text();
        const parsedResponse = safeJsonParse(responseBody);
        if (parsedResponse && parsedResponse.gameServerHost) {
          window.__bloxdCdpProxyStatus.gameServerHost = parsedResponse.gameServerHost;
          window.__bloxdCdpProxyStatus.lastMatchmake = {
            gameServerHost: parsedResponse.gameServerHost,
            lobbyName: parsedResponse.lobbyName,
            gameNameWithVariation: parsedResponse.gameNameWithVariation
          };
        }
        return {
          status: response.status,
          body: responseBody,
          socialId: extractSocialId(template.url),
          matchmakeUrl: template.url,
          sentBody: JSON.stringify(redactBody(matchmakeBody))
        };
      } catch (err) {
        window.__bloxdCdpProxyStatus.lastError = err && err.message ? err.message : String(err);
        return { error: window.__bloxdCdpProxyStatus.lastError, status: 0, body: '' };
      } finally {
        window.__bloxdCdpProxyMatchmakeInFlight = false;
      }
    },
    async requestTurnstileToken() {
      if (!document.getElementById('arthurisstupid')) {
        const screen = document.createElement('div');
        screen.id = 'arthurisstupid';
        screen.style = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none';
        document.documentElement.appendChild(screen);
      }
      if (!window.turnstile) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-bloxd-cdp-turnstile]');
          if (existing) {
            const loop = setInterval(() => {
              if (window.turnstile) {
                clearInterval(loop);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(loop);
              reject(new Error('Turnstile script timed out'));
            }, 15000);
            return;
          }
          const script = document.createElement('script');
          script.dataset.bloxdCdpTurnstile = 'true';
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Turnstile script'));
          document.head.appendChild(script);
        });
      }
      return await new Promise((resolve, reject) => {
        try {
          window.turnstile.render('#arthurisstupid', {
            sitekey: '0x4AAAAAAAa4cz8QxEw-M2SE',
            theme: 'dark',
            action: 'Greenlight',
            retry: 'never',
            'refresh-expired': 'never',
            callback: resolve
          });
        } catch (err) {
          reject(err);
        }
      });
    },
    releaseGamePage() {
      window.__bloxdCdpProxyStatus.released = true;
      window.__bloxdCdpProxyStatus.inGameDetected = false;
      console.log('[BloxdCDP] Release requested for built-in Bloxd page');
      try {
        if (window.__colyseusRoom && typeof window.__colyseusRoom.leave === 'function') window.__colyseusRoom.leave(true);
      } catch (err) {}
      try {
        window.dispatchEvent(new Event('beforeunload'));
      } catch (err) {}
      return true;
    }
  };
  console.log('[BloxdCDP] Proxy helper installed');
})();
`;

const INJECTED_PACKET_PROBE = `
(function() {
  if (window.__bloxdPacketProbeInstalled) return;
  window.__bloxdPacketProbeInstalled = true;
  const protocolNames = {
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
  const maxRecords = 300;
  const state = {
    installedAt: Date.now(),
    sockets: [],
    frames: [],
    sends: [],
    moduleHints: [],
    packetHints: [],
    decoderModuleIds: []
  };

  function push(list, item) {
    list.push(Object.assign({ at: Date.now() }, item));
    if (list.length > maxRecords) list.shift();
  }

  function bytesOf(data) {
    try {
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (typeof data === 'string') return new TextEncoder().encode(data);
    } catch (err) {}
    return null;
  }

  function hex(bytes, limit) {
    if (!bytes) return undefined;
    return Array.from(bytes.slice(0, Math.min(bytes.length, limit || 96))).map(function(value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  function summarizeData(data) {
    const bytes = bytesOf(data);
    if (!bytes) {
      return {
        dataType: data == null ? String(data) : (data.constructor && data.constructor.name) || typeof data,
        length: data && (data.byteLength || data.length || data.size) || null
      };
    }
    return {
      dataType: data && data.constructor && data.constructor.name || 'bytes',
      length: bytes.length,
      code: bytes[0],
      protocol: protocolNames[bytes[0]] || ('UNKNOWN_' + bytes[0]),
      hex: hex(bytes, 96)
    };
  }

  function summarizeValue(value) {
    if (value == null) return { valueType: String(value) };
    const bytes = bytesOf(value);
    if (bytes) return { valueType: value.constructor && value.constructor.name || 'bytes', length: bytes.length, hex: hex(bytes, 64) };
    if (typeof value === 'object') {
      const keys = Object.keys(value).slice(0, 24);
      return { valueType: value.constructor && value.constructor.name || 'Object', keys: keys };
    }
    return { valueType: typeof value, value: typeof value === 'string' ? value.slice(0, 120) : value };
  }

  function emit(kind, payload) {
    const event = Object.assign({ kind: kind, url: location.href }, payload || {});
    try {
      console.log('[BloxdProbe] ' + JSON.stringify(event));
    } catch (err) {
      console.log('[BloxdProbe] ' + JSON.stringify({ kind: kind, url: location.href, error: 'failed to stringify probe event' }));
    }
  }

  function isGameSocketUrl(url) {
    const text = String(url || '');
    return text.indexOf('gs-') !== -1 && text.indexOf('.bloxd.io') !== -1;
  }

  function installWebSocketProbe() {
    const OriginalWebSocket = window.WebSocket;
    if (!OriginalWebSocket || OriginalWebSocket.__bloxdPacketProbeWrapped) return;
    function WrappedWebSocket() {
      const args = Array.from(arguments);
      const ws = new (Function.prototype.bind.apply(OriginalWebSocket, [null].concat(args)))();
      const socketInfo = {
        id: state.sockets.length + 1,
        url: String(args[0] || ''),
        protocols: args[1] || null,
        gameSocket: isGameSocketUrl(args[0]),
        createdAt: Date.now()
      };
      state.sockets.push(socketInfo);
      emit('socket-created', socketInfo);

      const originalSend = ws.send;
      ws.send = function(data) {
        const summary = Object.assign({ socketId: socketInfo.id, socketUrl: socketInfo.url, direction: 'out' }, summarizeData(data));
        push(state.sends, summary);
        emit('socket-send', summary);
        return originalSend.call(this, data);
      };

      ws.addEventListener('message', function(event) {
        const summary = Object.assign({ socketId: socketInfo.id, socketUrl: socketInfo.url, direction: 'in' }, summarizeData(event.data));
        push(state.frames, summary);
        if (socketInfo.gameSocket || summary.protocol === 'ROOM_DATA' || summary.protocol === 'ROOM_DATA_BYTES' || summary.protocol === 'ROOM_STATE_PATCH') {
          emit('socket-frame', summary);
        }
      }, true);
      return ws;
    }
    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);
    WrappedWebSocket.__bloxdPacketProbeWrapped = true;
    window.WebSocket = WrappedWebSocket;
  }

  function looksLikePacketModule(source) {
    return source.indexOf('Buffer.from') !== -1 &&
      source.indexOf('onMessage') !== -1 &&
      source.indexOf('handleMessageForId') !== -1;
  }

  function looksLikeColyseusModule(source) {
    return source.indexOf('ROOM_DATA_BYTES') !== -1 ||
      (source.indexOf('binaryType') !== -1 && source.indexOf('onmessage') !== -1 && source.indexOf('sendBytes') !== -1);
  }

  function shortSource(source, needle) {
    const index = source.indexOf(needle);
    const start = Math.max(0, index - 220);
    return source.slice(start, Math.min(source.length, start + 620)).replace(/\\s+/g, ' ');
  }

  function addDecoderModuleId(moduleId) {
    if (moduleId == null) return;
    const text = String(moduleId);
    if (state.decoderModuleIds.indexOf(text) === -1) {
      state.decoderModuleIds.push(text);
      emit('decoder-module-candidate', { moduleId: text });
      wrapKnownDecoderModules(window.__bloxdPacketProbeWebpackRequire);
    }
  }

  function extractDecoderModuleId(source) {
    const match = source.match(/(?:var|let|const)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*[A-Za-z_$][\\w$]*\\((\\d+)\\)[\\s\\S]{0,260}?\\.Xb[\\s\\S]{0,180}?\\.b/);
    if (match) return match[1];
    const fallback = source.match(/([A-Za-z_$][\\w$]*)\\s*=\\s*[A-Za-z_$][\\w$]*\\((\\d+)\\)[\\s\\S]{0,420}?\\(0,\\1\\.Xb\\)[\\s\\S]{0,220}?\\(0,\\1\\.b\\)/);
    return fallback ? fallback[2] : undefined;
  }

  function wrapFunctionExport(exportsObj, exportName, wrapperFactory) {
    if (!exportsObj || exportsObj['__bloxdProbeWrapped_' + exportName]) return false;
    let original;
    try { original = exportsObj[exportName]; } catch (err) { return false; }
    if (typeof original !== 'function') return false;
    const wrapped = wrapperFactory(original);
    try {
      exportsObj[exportName] = wrapped;
      exportsObj['__bloxdProbeWrapped_' + exportName] = true;
      return true;
    } catch (err) {
      try {
        Object.defineProperty(exportsObj, exportName, { configurable: true, enumerable: true, value: wrapped });
        exportsObj['__bloxdProbeWrapped_' + exportName] = true;
        return true;
      } catch (err2) {}
    }
    return false;
  }

  function wrapDecoderExports(moduleId, exportsObj) {
    if (!exportsObj) return;
    const didWrapPredicate = wrapFunctionExport(exportsObj, 'Xb', function(original) {
      return function(packetId) {
        const result = original.apply(this, arguments);
        const event = {
          packetId: Number(packetId),
          officialBinary: Boolean(result),
          decoderModuleId: String(moduleId),
          source: 'official-Xb'
        };
        push(state.packetHints, event);
        emit('official-packet', event);
        return result;
      };
    });
    const didWrapDecoder = wrapFunctionExport(exportsObj, 'b', function(original) {
      return function(packetId, payload) {
        let decoded;
        try {
          decoded = original.apply(this, arguments);
          const event = Object.assign({
            packetId: Number(packetId),
            decoderModuleId: String(moduleId),
            source: 'official-b',
            payload: summarizeData(payload)
          }, summarizeValue(decoded));
          push(state.packetHints, event);
          emit('official-packet-decoded', event);
          return decoded;
        } catch (err) {
          emit('official-packet-decode-error', {
            packetId: Number(packetId),
            decoderModuleId: String(moduleId),
            message: err && err.message ? err.message : String(err),
            payload: summarizeData(payload)
          });
          throw err;
        }
      };
    });
    if (didWrapPredicate || didWrapDecoder) {
      emit('packet-dispatch module hooked', { moduleId: String(moduleId), wrappedPredicate: didWrapPredicate, wrappedDecoder: didWrapDecoder });
    }
  }

  function wrapModuleFactory(moduleId, factory) {
    if (typeof factory !== 'function' || factory.__bloxdPacketProbeWrapped) return factory;
    const wrappedFactory = function(module, exports, require) {
      const result = factory.apply(this, arguments);
      if (state.decoderModuleIds.indexOf(String(moduleId)) !== -1) {
        wrapDecoderExports(moduleId, module && module.exports);
        wrapDecoderExports(moduleId, exports);
      }
      return result;
    };
    wrappedFactory.__bloxdPacketProbeWrapped = true;
    return wrappedFactory;
  }

  function wrapKnownDecoderModules(require) {
    if (!require || !require.c) return;
    for (const moduleId of state.decoderModuleIds) {
      const cached = require.c[moduleId];
      if (cached && cached.exports) {
        wrapDecoderExports(moduleId, cached.exports);
      }
    }
  }

  function wrapRuntime(runtime) {
    if (typeof runtime !== 'function' || runtime.__bloxdPacketProbeWrapped) return runtime;
    const wrappedRuntime = function(require) {
      window.__bloxdPacketProbeWebpackRequire = require;
      wrapKnownDecoderModules(require);
      const result = runtime.apply(this, arguments);
      wrapKnownDecoderModules(require);
      return result;
    };
    wrappedRuntime.__bloxdPacketProbeWrapped = true;
    return wrappedRuntime;
  }

  function inspectChunkArgs(args) {
    try {
      const chunk = args && args[0];
      const modules = chunk && chunk[1];
      if (chunk && typeof chunk[2] === 'function') {
        chunk[2] = wrapRuntime(chunk[2]);
      }
      if (!modules || typeof modules !== 'object') return;
      for (const moduleId of Object.keys(modules)) {
        const source = String(modules[moduleId]);
        let hint = null;
        if (looksLikePacketModule(source)) {
          const decoderModuleId = extractDecoderModuleId(source);
          addDecoderModuleId(decoderModuleId);
          hint = {
            moduleId: moduleId,
            hintType: 'packet-dispatch',
            decoderModuleId: decoderModuleId,
            hasBinaryPredicate: source.indexOf('Xb') !== -1,
            hasBinaryDecode: source.indexOf('Buffer.from') !== -1,
            snippet: shortSource(source, 'Buffer.from')
          };
        } else if (looksLikeColyseusModule(source)) {
          hint = {
            moduleId: moduleId,
            hintType: 'colyseus-runtime',
            hasRoomDataBytes: source.indexOf('ROOM_DATA_BYTES') !== -1,
            hasSendBytes: source.indexOf('sendBytes') !== -1,
            snippet: shortSource(source, source.indexOf('ROOM_DATA_BYTES') !== -1 ? 'ROOM_DATA_BYTES' : 'sendBytes')
          };
        }
        if (hint) {
          push(state.moduleHints, hint);
          emit('module-hint', hint);
        }
        if (state.decoderModuleIds.indexOf(String(moduleId)) !== -1) {
          modules[moduleId] = wrapModuleFactory(moduleId, modules[moduleId]);
        }
        if (hint && hint.hintType === 'packet-dispatch') {
          modules[moduleId] = wrapModuleFactory(moduleId, modules[moduleId]);
        }
      }
      wrapKnownDecoderModules(window.__bloxdPacketProbeWebpackRequire);
    } catch (err) {
      emit('probe-error', { message: err && err.message ? err.message : String(err) });
    }
  }

  function installArrayPushProbe() {
    const originalPush = Array.prototype.push;
    if (originalPush.__bloxdPacketProbeWrapped) return;
    const wrappedPush = function() {
      for (const arg of arguments) {
        if (arg && Array.isArray(arg) && arg.length >= 2 && arg[1] && typeof arg[1] === 'object') {
          inspectChunkArgs([arg]);
        }
      }
      return originalPush.apply(this, arguments);
    };
    wrappedPush.__bloxdPacketProbeWrapped = true;
    Array.prototype.push = wrappedPush;
  }

  function scanLoadedScripts() {
    const scripts = Array.from(document.scripts || []).map(function(script) { return script.src; }).filter(Boolean);
    for (const src of scripts) {
      if (src.indexOf(location.origin + '/static/js/') !== 0) continue;
      if (state.scannedScripts && state.scannedScripts[src]) continue;
      state.scannedScripts = state.scannedScripts || {};
      state.scannedScripts[src] = true;
      fetch(src).then(function(response) { return response.text(); }).then(function(source) {
        if (looksLikePacketModule(source)) {
          const decoderModuleId = extractDecoderModuleId(source);
          addDecoderModuleId(decoderModuleId);
          emit('module-hint', {
            moduleId: 'script:' + src.split('/').pop(),
            hintType: 'packet-dispatch-source',
            decoderModuleId: decoderModuleId,
            hasBinaryPredicate: source.indexOf('Xb') !== -1,
            hasBinaryDecode: source.indexOf('Buffer.from') !== -1,
            snippet: shortSource(source, 'Buffer.from')
          });
        }
        if (looksLikeColyseusModule(source)) {
          emit('module-hint', {
            moduleId: 'script:' + src.split('/').pop(),
            hintType: 'colyseus-runtime-source',
            hasRoomDataBytes: source.indexOf('ROOM_DATA_BYTES') !== -1,
            hasSendBytes: source.indexOf('sendBytes') !== -1,
            snippet: shortSource(source, source.indexOf('ROOM_DATA_BYTES') !== -1 ? 'ROOM_DATA_BYTES' : 'sendBytes')
          });
        }
      }).catch(function(err) {
        emit('probe-error', { message: 'script scan failed: ' + (err && err.message ? err.message : String(err)), src: src });
      });
    }
  }

  function installWebpackProbe() {
    for (const key of Object.getOwnPropertyNames(window)) {
      if (key.indexOf('webpackChunk') === -1) continue;
      const chunkArray = window[key];
      if (!Array.isArray(chunkArray) || chunkArray.__bloxdPacketProbeWrapped) continue;
      for (const chunk of chunkArray) inspectChunkArgs([chunk]);
      const originalPush = chunkArray.push;
      chunkArray.push = function() {
        for (const arg of arguments) inspectChunkArgs([arg]);
        return originalPush.apply(this, arguments);
      };
      chunkArray.__bloxdPacketProbeWrapped = true;
      emit('webpack-hooked', { key: key, existingChunks: chunkArray.length });
    }
  }

  installArrayPushProbe();
  installWebSocketProbe();
  installWebpackProbe();
  scanLoadedScripts();
  const webpackTimer = setInterval(function() {
    installWebpackProbe();
    scanLoadedScripts();
  }, 250);
  setTimeout(function() { clearInterval(webpackTimer); }, 30000);

  window.__bloxdPacketProbe = {
    state: state,
    summary: function() {
      return {
        installedAt: new Date(state.installedAt).toISOString(),
        sockets: state.sockets,
        frameCount: state.frames.length,
        sendCount: state.sends.length,
        moduleHints: state.moduleHints.slice(-20),
        packetHints: state.packetHints.slice(-40),
        decoderModuleIds: state.decoderModuleIds.slice(),
        recentFrames: state.frames.slice(-30),
        recentSends: state.sends.slice(-30)
      };
    }
  };
  emit('installed', { href: location.href });
})();
`;

export class BloxdCdpProvider extends EventEmitter {
  public readonly name = 'electron-cdp';
  private window?: BrowserWindow;
  private status: BloxdPageStatus = 'not-loaded';
  private templateCaptured = false;
  private released = false;
  private inGameDetected = false;
  private releaseTimer?: NodeJS.Timeout;
  private knownGameServerHost?: string;
  private autoCloseWhenGameDetected = true;
  private lastError?: string;
  private readyPromise?: Promise<void>;
  private packetProbeFile?: string;
  private webSocketRequestUrls = new Map<string, string>();
  private officialPacketMap = new Map<number, boolean>();

  getStatus(): BloxdStatus {
    return {
      status: this.status,
      visible: Boolean(this.window && this.window.isVisible()),
      provider: 'electron-cdp',
      url: this.window?.webContents.getURL(),
      templateCaptured: this.templateCaptured,
      released: this.released,
      inGameDetected: this.inGameDetected,
      lastError: this.lastError
    };
  }

  async ensureWindow(show = false): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) {
      if (show) this.window.show();
      return this.window;
    }

    this.status = 'loading';
    this.emitStatus();
    this.window = new BrowserWindow({
      width: 1280,
      height: 860,
      show,
      title: 'Bloxd Browser',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:bloxd-ui'
      }
    });

    const contents = this.window.webContents;
    this.attachDebugger(contents);
    this.window.on('closed', () => {
      this.window = undefined;
      this.status = this.released ? 'released' : 'not-loaded';
      this.inGameDetected = false;
      this.emitStatus();
    });
    contents.on('did-finish-load', async () => {
      await this.installHelper().catch((err) => this.setError(err));
      await this.refreshPageStatus().catch(() => {});
    });
    contents.on('console-message', (_event, _level, message) => {
      if (message.includes('[BloxdCDP]')) this.emit('log', message);
      if (message.includes('[BloxdProbe]')) this.handlePacketProbeConsole(message);
    });
    await contents.loadURL('https://bloxd.io');
    return this.window;
  }

  async show(): Promise<BloxdStatus> {
    const win = await this.ensureWindow(true);
    win.show();
    return this.getStatus();
  }

  async hide(): Promise<BloxdStatus> {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
    this.emitStatus();
    return this.getStatus();
  }

  async reload(): Promise<BloxdStatus> {
    const win = await this.ensureWindow(true);
    this.status = 'loading';
    this.emitStatus();
    win.webContents.reloadIgnoringCache();
    return this.getStatus();
  }

  async waitReady(timeoutMs = 30000): Promise<boolean> {
    await this.ensureWindow(false);
    if (!this.readyPromise) {
      this.readyPromise = this.waitForHelper(timeoutMs);
    }
    await this.readyPromise;
    return true;
  }

  async doMatchmake(contents: MatchmakeContents): Promise<MatchmakeResult> {
    await this.waitReady();
    const result = await this.evaluate<MatchmakeResult>(
      `window.__bloxdCdpProxy.doMatchmake(${JSON.stringify(contents || {})})`,
      true
    );
    if (result.status >= 200 && result.status < 300) {
      this.scheduleRelease('proxy matchmake completed');
    }
    await this.refreshPageStatus().catch(() => {});
    return result;
  }

  async releaseGamePage(reason = 'manual release'): Promise<BloxdStatus> {
    await this.evaluate<boolean>('window.__bloxdCdpProxy && window.__bloxdCdpProxy.releaseGamePage && window.__bloxdCdpProxy.releaseGamePage()', true).catch(() => false);
    this.released = true;
    this.inGameDetected = false;
    this.status = this.templateCaptured ? 'released' : 'ready';
    this.emit('log', `[BloxdCDP] Game page detected, releasing built-in Bloxd page to avoid duplicate session (${reason})`);
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.emitStatus();
    return this.getStatus();
  }

  async requestTurnstileToken(): Promise<string> {
    await this.show();
    await this.waitReady();
    return await this.evaluate<string>('window.__bloxdCdpProxy.requestTurnstileToken()', true);
  }

  async getLoginCookies(): Promise<BloxdLoginCookies> {
    const win = await this.ensureWindow(true);
    const cookies = await win.webContents.session.cookies.get({ url: 'https://bloxd.io' });
    const cookieMap: Record<string, string> = {};
    for (const cookie of cookies) {
      cookieMap[cookie.name] = cookie.value;
    }
    const tokenCookie = cookies.find((cookie) => cookie.name.includes('3PSIDMC') && !cookie.name.includes('SP') && !cookie.name.includes('PP'));
    return {
      token3PSIDMC: tokenCookie?.value,
      cookies: cookieMap
    };
  }

  private attachDebugger(contents: WebContents): void {
    const debug = contents.debugger;
    if (!debug.isAttached()) {
      debug.attach('1.3');
    }
    debug.sendCommand('Runtime.enable').catch(() => {});
    debug.sendCommand('Page.enable').catch(() => {});
    debug.sendCommand('Network.enable').catch(() => {});
    debug.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_PACKET_PROBE }).catch((err) => this.setError(err));
    debug.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_PROXY }).catch((err) => this.setError(err));
    debug.on('message', (_event, method, params) => {
      if (method === 'Network.webSocketCreated' && this.isGameUrl(params?.url)) {
        if (typeof params?.requestId === 'string' && typeof params?.url === 'string') {
          this.webSocketRequestUrls.set(params.requestId, params.url);
        }
        this.markInGame('websocket', params.url);
      }
      if (method === 'Network.requestWillBeSent' && this.isGameUrl(params?.request?.url)) {
        this.markInGame('request', params.request.url);
      }
      if (method === 'Network.responseReceived' && params?.response?.url?.includes('bloxd-matchmake')) {
        this.readMatchmakeResponse(params.requestId).catch((err) => this.emit('log', `[BloxdCDP] Failed reading matchmake response: ${err}`));
      }
      if (method === 'Network.requestWillBeSent' && params?.request?.url?.includes('bloxd-matchmake')) {
        this.emit('log', `[BloxdCDP] ${params.request.method} ${params.request.url}`);
      }
      if (method === 'Network.webSocketFrameReceived') {
        const socketUrl = typeof params?.requestId === 'string' ? this.webSocketRequestUrls.get(params.requestId) : undefined;
        if (!this.isGameUrl(socketUrl)) return;
        this.writePacketProbeEvent({
          kind: 'cdp-websocket-frame',
          url: socketUrl,
          opcode: params.response.opcode,
          mask: params.response.mask,
          payloadLength: typeof params.response.payloadData === 'string' ? params.response.payloadData.length : undefined
        });
      }
    });
    debug.on('detach', (_event, reason) => {
      this.lastError = `CDP detached: ${reason}`;
      this.emitStatus();
    });
  }

  private isGameUrl(url: unknown): boolean {
    const text = String(url || '');
    return (text.includes('gs-') && text.includes('.bloxd.io')) || Boolean(this.knownGameServerHost && text.includes(this.knownGameServerHost));
  }

  private markInGame(reason: string, url?: string): void {
    this.inGameDetected = true;
    this.emit('log', `[BloxdCDP] Game connection detected by ${reason}${url ? `: ${url}` : ''}`);
    this.scheduleRelease(reason, reason === 'websocket' ? 7000 : 500);
  }

  private scheduleRelease(reason: string, delayMs = 500): void {
    if (!this.autoCloseWhenGameDetected || this.releaseTimer || !this.window || this.window.isDestroyed()) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      this.releaseGamePage(reason).catch((err) => this.setError(err));
    }, delayMs);
  }

  private getPacketProbeFile(): string {
    if (!this.packetProbeFile) {
      fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
      this.packetProbeFile = path.join(DIAGNOSTICS_DIR, `chrome-packet-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    }
    return this.packetProbeFile;
  }

  private handlePacketProbeConsole(message: string): void {
    const marker = '[BloxdProbe] ';
    const markerIndex = message.indexOf(marker);
    if (markerIndex < 0) return;
    const jsonText = message.slice(markerIndex + marker.length).trim();
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      event = { kind: 'parse-error', message };
    }
    this.writePacketProbeEvent(event);
    const kind = typeof event.kind === 'string' ? event.kind : 'event';
    if (kind === 'module-hint' || kind === 'socket-created' || kind === 'socket-frame') {
      this.emit('log', `[BloxdProbe] ${kind} written to ${this.getPacketProbeFile()}`);
    }
    if (kind === 'official-packet' && typeof event.packetId === 'number' && typeof event.officialBinary === 'boolean') {
      this.officialPacketMap.set(event.packetId, event.officialBinary);
      this.writeOfficialPacketMap();
      this.emit('official-packet', { packetId: event.packetId, officialBinary: event.officialBinary });
    }
    if (kind === 'socket-created' && typeof event.url === 'string' && this.isGameUrl(event.url)) {
      this.scheduleRelease('packet probe game socket', 7000);
    }
  }

  private writePacketProbeEvent(event: Record<string, unknown>): void {
    try {
      const file = this.getPacketProbeFile();
      fs.appendFileSync(file, JSON.stringify({
        at: new Date().toISOString(),
        ...event
      }) + '\n');
    } catch (err) {
      this.emit('log', `[BloxdProbe] Failed writing diagnostics: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private writeOfficialPacketMap(): void {
    try {
      fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
      const file = path.join(DIAGNOSTICS_DIR, 'official-packet-map-latest.json');
      fs.writeFileSync(file, JSON.stringify({
        at: new Date().toISOString(),
        packets: Object.fromEntries([...this.officialPacketMap.entries()].sort((a, b) => a[0] - b[0]))
      }, null, 2));
    } catch (err) {
      this.emit('log', `[BloxdProbe] Failed writing official packet map: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async readMatchmakeResponse(requestId: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const response = await this.window.webContents.debugger.sendCommand('Network.getResponseBody', { requestId }).catch(() => undefined);
    if (!response || typeof response.body !== 'string') return;
    let bodyText = response.body;
    if (response.base64Encoded) {
      bodyText = Buffer.from(response.body, 'base64').toString('utf8');
    }
    let parsed: { gameServerHost?: string; lobbyName?: string; gameNameWithVariation?: string };
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return;
    }
    if (parsed.gameServerHost) {
      this.knownGameServerHost = parsed.gameServerHost;
      this.templateCaptured = true;
      this.emit('log', `[BloxdCDP] Matchmake returned ${parsed.gameNameWithVariation ?? 'game'} lobby ${parsed.lobbyName ?? '?'} on ${parsed.gameServerHost}`);
      this.scheduleRelease('matchmake response');
      this.emitStatus();
    }
  }

  private async installHelper(): Promise<void> {
    await this.evaluate(INJECTED_PACKET_PROBE, false).catch(() => {});
    await this.evaluate(INJECTED_PROXY, false);
  }

  private async waitForHelper(timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ready = await this.evaluate<boolean>('Boolean(window.__bloxdCdpProxy)', false).catch(() => false);
      if (ready) {
        this.status = 'ready';
        this.emitStatus();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Timed out waiting for Bloxd CDP helper');
  }

  private async refreshPageStatus(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const pageStatus = await this.evaluate<{ templateCaptured: boolean; lastError?: string; released?: boolean; inGameDetected?: boolean; gameServerHost?: string }>(
      'window.__bloxdCdpProxy ? window.__bloxdCdpProxy.getStatus() : { templateCaptured: false }',
      false
    );
    this.templateCaptured = Boolean(pageStatus.templateCaptured);
    this.released = Boolean(pageStatus.released || this.released);
    this.inGameDetected = Boolean(pageStatus.inGameDetected);
    if (pageStatus.gameServerHost) this.knownGameServerHost = pageStatus.gameServerHost;
    this.lastError = pageStatus.lastError;
    this.status = this.released ? 'released' : (this.templateCaptured ? 'template-captured' : 'ready');
    this.emitStatus();
  }

  private async evaluate<T>(expression: string, awaitPromise: boolean): Promise<T> {
    if (!this.window || this.window.isDestroyed()) throw new Error('Bloxd window is not available');
    const result = await this.window.webContents.debugger.sendCommand('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'CDP evaluation failed');
    }
    return result.result.value as T;
  }

  private setError(err: unknown): void {
    this.status = 'error';
    this.lastError = err instanceof Error ? err.message : String(err);
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
