import { BrowserWindow, WebContents } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { BloxdPageStatus, BloxdStatus, MatchmakeCapture } from '../shared/types';

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
  gameServerHost?: string;
  lobbyName?: string;
  gameNameWithVariation?: string;
};

type PageClientConnectOptions = {
  gameNameWithVariation?: string;
  lobbyNameOrDiscordContext?: string;
};

type BloxdPageBridgeState = {
  connected?: boolean;
  gameSocketConnected?: boolean;
  worldReady?: boolean;
  inputReady?: boolean;
  localEntityId?: string | number;
  chunkCount?: number;
  lastGameSocketUrl?: string;
  lastPosition?: {
    x?: number;
    y?: number;
    z?: number;
    heading?: number;
    pitch?: number;
    speed?: number;
    jumping?: boolean;
    crouching?: boolean;
  };
  missingActionHooks?: string[];
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
      lastError: undefined,
      capturedAt: Date.now()
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
          error: 'No captured Bloxd matchmake template yet.',
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
    return source.indexOf('grenoergi') !== -1 ||
      (source.indexOf('Xb') !== -1 && source.indexOf('.b(') !== -1 && source.indexOf('ArrayBuffer') !== -1) ||
      (source.indexOf('Xb') !== -1 && source.indexOf('Buffer.from') !== -1) ||
      (source.indexOf('ROOM_DATA_BYTES') !== -1 && source.indexOf('Buffer.from') !== -1) ||
      (source.indexOf('generatePackets') !== -1 && source.indexOf('Math.imul') !== -1 && source.indexOf('16777619') !== -1);
  }

  function looksLikeColyseusModule(source) {
    return source.indexOf('colyseusPingInfo') !== -1 ||
      (source.indexOf('onMessage') !== -1 && source.indexOf('sendBytes') !== -1);
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

  function rememberRequire(require, source) {
    if (!require || typeof require !== 'function') return;
    window.__bloxdPacketProbeWebpackRequire = require;
    emit('webpack-require-seen', {
      source: source || 'unknown',
      hasModules: Boolean(require.m),
      hasCache: Boolean(require.c),
      moduleCount: require.m ? Object.keys(require.m).length : undefined,
      cacheCount: require.c ? Object.keys(require.c).length : undefined
    });
    scanWebpackRequire(require, source || 'remember');
  }

  window.__bloxdPacketProbeRememberRequire = rememberRequire;

  function extractDecoderModuleId(source) {
    const match = source.match(/(?:var|let|const)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*[A-Za-z_$][\\w$]*\\((\\d+)\\)[\\s\\S]{0,260}?\\.Xb[\\s\\S]{0,180}?\\.b/);
    if (match) return match[1];
    const fallback = source.match(/([A-Za-z_$][\\w$]*)\\s*=\\s*[A-Za-z_$][\\w$]*\\((\\d+)\\)[\\s\\S]{0,420}?\\(0,\\1\\.Xb\\)[\\s\\S]{0,220}?\\(0,\\1\\.b\\)/);
    const newFormat = source.match(/(?:var|let|const)\\s+(\\w+)\\s*=\\s*function\\s*\\(\\w+\\)\\s*\\{[\\s\\S]{0,800}?Xb[\\s\\S]{0,200}?\\.b\\s*=/);
    return newFormat ? newFormat[1] : (fallback ? fallback[2] : undefined);
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

  function inspectExportsForDecoder(moduleId, exportsObj, source) {
    if (!exportsObj || typeof exportsObj !== 'object') return false;
    let hasPredicate = false;
    let hasDecoder = false;
    try { hasPredicate = typeof exportsObj.Xb === 'function'; } catch (err) {}
    try { hasDecoder = typeof exportsObj.b === 'function'; } catch (err) {}
    if (!hasPredicate && !hasDecoder) return false;
    addDecoderModuleId(moduleId);
    emit('decoder-exports-candidate', {
      moduleId: String(moduleId),
      source: source || 'exports',
      hasPredicate,
      hasDecoder,
      exportKeys: Object.keys(exportsObj).slice(0, 20)
    });
    wrapDecoderExports(moduleId, exportsObj);
    return true;
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

  function scanWebpackRequire(require, source) {
    if (!require) return;
    try {
      if (require.m) {
        for (const moduleId of Object.keys(require.m)) {
          const factory = require.m[moduleId];
          const factorySource = String(factory);
          let hint = null;
          if (looksLikePacketModule(factorySource)) {
            const decoderModuleId = extractDecoderModuleId(factorySource);
            addDecoderModuleId(decoderModuleId);
            hint = {
              moduleId: String(moduleId),
              hintType: 'webpack-factory-packet-dispatch',
              source: source || 'require.m',
              decoderModuleId,
              hasBinaryPredicate: factorySource.indexOf('Xb') !== -1,
              hasBinaryDecode: factorySource.indexOf('Buffer.from') !== -1 || factorySource.indexOf('.b(') !== -1,
              snippet: shortSource(factorySource, factorySource.indexOf('Buffer.from') !== -1 ? 'Buffer.from' : 'Xb')
            };
          } else if (looksLikeColyseusModule(factorySource)) {
            hint = {
              moduleId: String(moduleId),
              hintType: 'webpack-factory-colyseus-runtime',
              source: source || 'require.m',
              hasRoomDataBytes: factorySource.indexOf('ROOM_DATA_BYTES') !== -1,
              hasSendBytes: factorySource.indexOf('sendBytes') !== -1,
              snippet: shortSource(factorySource, factorySource.indexOf('ROOM_DATA_BYTES') !== -1 ? 'ROOM_DATA_BYTES' : 'sendBytes')
            };
          }
          if (hint) {
            push(state.moduleHints, hint);
            emit('module-hint', hint);
          }
          if (hint && hint.hintType === 'webpack-factory-packet-dispatch') {
            require.m[moduleId] = wrapModuleFactory(moduleId, factory);
          }
          if (state.decoderModuleIds.indexOf(String(moduleId)) !== -1) {
            require.m[moduleId] = wrapModuleFactory(moduleId, factory);
          }
        }
      }
      if (require.c) {
        for (const moduleId of Object.keys(require.c)) {
          const cached = require.c[moduleId];
          inspectExportsForDecoder(moduleId, cached && cached.exports, source || 'require.c');
        }
      }
      wrapKnownDecoderModules(require);
    } catch (err) {
      emit('probe-error', { message: 'scanWebpackRequire failed: ' + (err && err.message ? err.message : String(err)), source });
    }
  }

  function wrapRuntime(runtime) {
    if (typeof runtime !== 'function' || runtime.__bloxdPacketProbeWrapped) return runtime;
    const wrappedRuntime = function(require) {
      rememberRequire(require, 'runtime-before');
      const result = runtime.apply(this, arguments);
      rememberRequire(require, 'runtime-after');
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
      scanWebpackRequire(window.__bloxdPacketProbeWebpackRequire, 'chunk-inspect');
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

  function discoverWebpackRequireFromGlobals() {
    for (const key of Object.getOwnPropertyNames(window)) {
      let value;
      try { value = window[key]; } catch (err) { continue; }
      if (typeof value === 'function' && (value.m || value.c)) {
        rememberRequire(value, 'window.' + key);
      }
      if (value && typeof value === 'object') {
        for (const nestedKey of Object.keys(value).slice(0, 80)) {
          let nested;
          try { nested = value[nestedKey]; } catch (err) { continue; }
          if (typeof nested === 'function' && (nested.m || nested.c)) {
            rememberRequire(nested, 'window.' + key + '.' + nestedKey);
          }
        }
      }
    }
    if (window.__bloxdPacketProbeWebpackRequire) {
      scanWebpackRequire(window.__bloxdPacketProbeWebpackRequire, 'global-discovery');
    }
  }

  function installWebpackProbe() {
    discoverWebpackRequireFromGlobals();
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

const INJECTED_PAGE_BRIDGE = `
(function() {
  if (window.__bloxdPageBridgeInstalled) return;
  window.__bloxdPageBridgeInstalled = true;
  const state = {
    installedAt: Date.now(),
    connected: false,
    lastGameSocketUrl: undefined,
    lastAction: undefined,
    actionCount: 0,
    inputReady: false,
    worldReady: false,
    chunkCount: 0,
    localEntityId: undefined,
    lastPosition: undefined,
    missingActionHooks: []
  };

  function emit(kind, payload) {
    try {
      console.log('[BloxdPageBridge] ' + JSON.stringify(Object.assign({
        kind,
        at: Date.now(),
        href: location.href
      }, payload || {})));
    } catch (err) {
      console.log('[BloxdPageBridge] ' + JSON.stringify({ kind: 'bridge-log-error', message: String(err) }));
    }
  }

  function isGameSocketUrl(url) {
    const text = String(url || '');
    return text.indexOf('gs-') !== -1 && text.indexOf('.bloxd.io') !== -1;
  }

  const OriginalWebSocket = window.WebSocket;
  if (OriginalWebSocket && !OriginalWebSocket.__bloxdPageBridgeWrapped) {
    function WrappedWebSocket() {
      const args = Array.from(arguments);
      const ws = new (Function.prototype.bind.apply(OriginalWebSocket, [null].concat(args)))();
      const url = String(args[0] || '');
      if (isGameSocketUrl(url)) {
        state.connected = true;
        state.lastGameSocketUrl = url;
        emit('game-socket-opened', { url });
        ws.addEventListener('close', function(event) {
          state.connected = false;
          emit('game-socket-closed', { url, code: event.code, reason: event.reason });
        }, true);
      }
      return ws;
    }
    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);
    WrappedWebSocket.__bloxdPageBridgeWrapped = true;
    window.WebSocket = WrappedWebSocket;
  }

  window.__bloxdPageBridge = {
    getState() {
      const canvas = document.querySelector('canvas');
      state.inputReady = Boolean(canvas);
      state.worldReady = Boolean(state.connected && canvas);
      return {
        connected: state.connected,
        gameSocketConnected: state.connected,
        worldReady: state.worldReady,
        inputReady: state.inputReady,
        localEntityId: state.localEntityId,
        chunkCount: state.chunkCount,
        lastPosition: state.lastPosition,
        missingActionHooks: state.missingActionHooks.slice(-20),
        lastGameSocketUrl: state.lastGameSocketUrl,
        lastAction: state.lastAction,
        actionCount: state.actionCount,
        href: location.href
      };
    },
    sendAction(action) {
      state.actionCount += 1;
      state.lastAction = action;
      if (action && action.packetName === 'CPacketMovePlayer' && action.data) {
        state.lastPosition = {
          x: action.data.x,
          y: action.data.y,
          z: action.data.z,
          heading: action.data.heading,
          pitch: action.data.pitch,
          speed: action.data.speed,
          jumping: action.data.jumping,
          crouching: action.data.crouching
        };
      }
      if (action && action.packetName && state.missingActionHooks.indexOf(action.packetName) === -1) {
        state.missingActionHooks.push(action.packetName);
      }
      if (!action || action.packetName !== 'CPacketMovePlayer') {
        emit('action', {
          packetName: action && action.packetName,
          actionName: action && action.actionName,
          dataType: action && action.data == null ? String(action.data) : typeof (action && action.data),
          handled: false
        });
      }
      return {
        ok: true,
        handledByOfficialClient: false,
        reason: 'Action recorded by page bridge; CDP input dispatch is handled by Electron main.'
      };
    }
  };
  emit('installed');
})();
`;

function createObservableCollection(): any {
  const addListeners: Array<(value: any, key: string) => void> = [];
  const removeListeners: Array<(value: any, key: string) => void> = [];
  const target: Record<string, any> = {
    onAdd(listener: (value: any, key: string) => void) {
      addListeners.push(listener);
    },
    onRemove(listener: (value: any, key: string) => void) {
      removeListeners.push(listener);
    },
    $items: []
  };

  return new Proxy(target, {
    set(obj, prop, value) {
      const key = String(prop);
      const existed = Object.prototype.hasOwnProperty.call(obj, key);
      obj[key] = value;
      if (!existed && !['onAdd', 'onRemove', '$items'].includes(key)) {
        for (const listener of addListeners) listener(value, key);
      }
      return true;
    },
    deleteProperty(obj, prop) {
      const key = String(prop);
      const value = obj[key];
      const existed = Object.prototype.hasOwnProperty.call(obj, key);
      delete obj[key];
      if (existed && !['onAdd', 'onRemove', '$items'].includes(key)) {
        for (const listener of removeListeners) listener(value, key);
      }
      return true;
    }
  });
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let current = value >>> 0;
  while (current >= 128) {
    bytes.push((current & 127) | 128);
    current >>>= 7;
  }
  bytes.push(current);
  return bytes;
}

function pushRun(target: number[], count: number, value: number): void {
  if (count <= 0) return;
  target.push(...encodeVarint(count), ...encodeVarint(value));
}

function buildFallbackChunkRle(baseY: number): number[] {
  const air = 0;
  const grassBlock = 4;
  const data: number[] = [];
  let lastValue = air;
  let runLength = 0;
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) {
      for (let z = 0; z < 32; z++) {
        const worldY = baseY + y;
        const value = worldY === 79 ? grassBlock : air;
        if (value === lastValue) {
          runLength += 1;
        } else {
          pushRun(data, runLength, lastValue);
          lastValue = value;
          runLength = 1;
        }
      }
    }
  }
  pushRun(data, runLength, lastValue);
  return data;
}

class ElectronBloxdPageClient extends EventEmitter {
  public name = '';
  public pass: number[] = [];
  public connected = false;
  public gameName = 'skywars';
  public lobbyName = '';
  public ip = '';
  public settings: Record<string, any> = {
    walkingSpeed: 4,
    runningSpeed: 7,
    canPickUpItems: false
  };
  public settingsEvent = new EventEmitter();
  public room = {
    state: {
      tickCounter: 0,
      entities: createObservableCollection(),
      items: createObservableCollection()
    }
  };
  private tickTimer?: NodeJS.Timeout;
  private fallbackChunksSent = false;

  constructor(
    private provider: BloxdCdpProvider,
    private options: PageClientConnectOptions
  ) {
    super();
  }

  async connect(): Promise<void> {
    const capture = await this.provider.activatePageRuntime(this.options);
    const bridgeState = await this.provider.waitWorldReady(30000);
    this.gameName = capture.gameNameWithVariation || this.options.gameNameWithVariation || 'skywars';
    this.lobbyName = capture.lobbyName || String(this.options.lobbyNameOrDiscordContext || '');
    this.ip = capture.gameServerHost;
    this.connected = true;
    this.tickTimer = setInterval(() => {
      this.room.state.tickCounter += 1;
    }, 50);
    this.emit('SPacketJoinGame', {
      eId: 'local',
      pass: [],
      pageClient: true,
      gameNameWithVariation: this.gameName,
      lobbyName: this.lobbyName,
      gameServerHost: this.ip,
      bridgeState
    });
    setImmediate(() => this.emitInitialWorld(bridgeState));
  }

  send(packetName: string, data?: unknown): void {
    if (!this.connected) return;
    if (packetName === 'CPacketRequestChunk') {
      this.handleChunkRequest(data as Record<string, unknown>);
    }
    this.provider.dispatchPageAction({
      packetName,
      data,
      gameName: this.gameName,
      lobbyName: this.lobbyName
    }).catch((err) => {
      this.provider.emit('log', `[BloxdPageClient] Failed forwarding ${packetName}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  getState(): Record<string, unknown> {
    return {
      connected: this.connected,
      gameName: this.gameName,
      lobbyName: this.lobbyName,
      ip: this.ip
    };
  }

  emitOfficialPacket(packetName: string, data: unknown): void {
    this.emit(packetName, data);
  }

  private emitInitialWorld(bridgeState: BloxdPageBridgeState): void {
    if (!this.connected) return;
    this.emit('SPacketServerSetting', {
      walkingSpeed: 4,
      runningSpeed: 7,
      canPickUpItems: false
    });
    this.emit('SPacketEntitySetting', {
      eId: 'local',
      settings: { _isAlive: true }
    });
    this.settingsEvent.emit('_health', 1);
    this.emit('SPacketPlayerTeleport', {
      id: 1,
      x: bridgeState.lastPosition?.x ?? 0,
      y: bridgeState.lastPosition?.y ?? 80,
      z: bridgeState.lastPosition?.z ?? 0
    });
    if (!bridgeState.chunkCount) {
      this.emitFallbackChunks();
    }
  }

  private emitFallbackChunks(): void {
    if (this.fallbackChunksSent) return;
    this.fallbackChunksSent = true;
    const chunkCoords = [-1, 0, 1];
    for (const x of chunkCoords) {
      for (const z of chunkCoords) {
        for (const y of [0, 1, 2]) {
          const id = `${x}|${y}|${z}|overworld`;
          this.emit('SPacketChunkData', {
            id,
            cancelled: false,
            pageClientFallback: true,
            RLEArr: buildFallbackChunkRle(y * 32)
          });
        }
      }
    }
    this.provider.emit('log', '[BloxdPageClient] chunk-forwarded fallback: emitted visible placeholder chunks until official chunk bridge is mapped');
  }

  private handleChunkRequest(data?: Record<string, unknown>): void {
    const id = typeof data?.id === 'string' ? data.id : undefined;
    if (!id) return;
    const parts = id.split('|');
    const y = Number(parts[1] || 0);
    this.emit('SPacketChunkData', {
      id,
      cancelled: false,
      pageClientFallback: true,
      RLEArr: buildFallbackChunkRle(y * 32)
    });
    this.provider.noteFallbackChunkForwarded();
  }

  disconnect(): void {
    this.connected = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    this.provider.dispatchPageAction({ actionName: 'disconnect' }).catch(() => {});
    this.removeAllListeners();
  }
}

export class BloxdCdpProvider extends EventEmitter {
  public readonly name = 'electron-cdp';
  private window?: BrowserWindow;
  private status: BloxdPageStatus = 'not-loaded';
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
  private pageClientMode = false;
  private currentPageClient?: ElectronBloxdPageClient;
  private pageClientState: BloxdPageBridgeState = {};
  private pressedInputKeys = new Set<string>();
  private movementLog = { count: 0, lastAt: 0, lastAction: undefined as Record<string, unknown> | undefined };
  private fallbackChunkLog = { count: 0, lastAt: 0 };
  private lastMatchmake?: MatchmakeCapture & { body: string; status: number; statusText?: string };
  private matchmakeWaiters: Array<{
    resolve: (value: MatchmakeCapture | null) => void;
    timer: NodeJS.Timeout;
  }> = [];

  getStatus(): BloxdStatus {
    return {
      status: this.status,
      visible: Boolean(this.window && this.window.isVisible()),
      provider: this.pageClientMode ? 'electron-page-client' : 'electron-cdp-once',
      url: this.window?.webContents.getURL(),
      released: this.released,
      inGameDetected: this.inGameDetected,
      pageClientState: this.pageClientState,
      lastMatchmake: this.lastMatchmake ? this.publicMatchmake(this.lastMatchmake) : undefined,
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
      if (message.includes('[BloxdPageBridge]')) this.handlePageBridgeConsole(message);
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

  setPageClientMode(enabled: boolean): void {
    this.pageClientMode = enabled;
    this.autoCloseWhenGameDetected = !enabled;
    if (enabled) this.released = false;
    if (enabled && this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
    }
    this.emitStatus();
  }

  createPageClient(contents: PageClientConnectOptions): ElectronBloxdPageClient {
    this.setPageClientMode(true);
    if (this.currentPageClient) this.currentPageClient.disconnect();
    this.currentPageClient = new ElectronBloxdPageClient(this, contents || {});
    return this.currentPageClient;
  }

  async activatePageRuntime(contents: PageClientConnectOptions, timeoutMs = 90000): Promise<MatchmakeCapture> {
    this.setPageClientMode(true);
    await this.ensureWindow(true);
    await this.waitReady();
    await this.evaluate(INJECTED_PAGE_BRIDGE, false).catch(() => {});
    if (this.inGameDetected && this.lastMatchmake && this.matchesCapture(this.lastMatchmake, contents)) {
      this.emit('log', `[BloxdPageClient] Using active official page session: ${this.lastMatchmake.gameNameWithVariation ?? 'game'} lobby ${this.lastMatchmake.lobbyName ?? '?'}`);
      return this.publicMatchmake(this.lastMatchmake);
    }
    if (!this.inGameDetected && this.lastMatchmake) {
      this.emit('log', '[BloxdPageClient] Ignoring stale matchmake capture because the official page is not in game.');
      this.lastMatchmake = undefined;
      this.emitStatus();
    }
    this.emit('log', '[BloxdPageClient] Waiting for the built-in Bloxd page to join a game. Log in and click Play if needed.');
    this.status = 'waiting-login';
    this.emitStatus();
    const capture = await this.waitForOfficialMatchmake(timeoutMs);
    if (!capture) throw new Error('Timed out waiting for the official Bloxd page to enter a game.');
    await this.waitForGameConnection(12000);
    return capture;
  }

  async waitWorldReady(timeoutMs = 30000): Promise<BloxdPageBridgeState> {
    this.status = 'waiting-world';
    this.emitStatus();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const state = await this.getPageBridgeState();
      this.pageClientState = state;
      if ((state.gameSocketConnected || state.connected || this.inGameDetected) && state.inputReady) {
        this.pageClientState = {
          ...state,
          worldReady: Boolean(state.worldReady || state.inputReady)
        };
        this.status = 'ready';
        this.emit('log', `[BloxdPageClient] world-ready socket=${Boolean(state.gameSocketConnected || state.connected || this.inGameDetected)} input=${Boolean(state.inputReady)} chunks=${state.chunkCount || 0}`);
        this.emitStatus();
        return this.pageClientState;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    this.status = 'input-missing';
    this.emitStatus();
    throw new Error('Official Bloxd page is not world-ready yet: no game socket/canvas state was observed.');
  }

  async dispatchPageAction(action: Record<string, unknown>): Promise<unknown> {
    if (!this.window || this.window.isDestroyed()) return { ok: false, error: 'Bloxd page is not open' };
    await this.evaluate(INJECTED_PAGE_BRIDGE, false).catch(() => {});
    await this.dispatchInputAction(action).catch((err) => {
      this.emit('log', `[BloxdPageClient] official-action-missing ${String(action.packetName || action.actionName || 'action')}: ${err instanceof Error ? err.message : String(err)}`);
    });
    return await this.evaluate(
      `window.__bloxdPageBridge && window.__bloxdPageBridge.sendAction(${JSON.stringify(action)})`,
      true
    ).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  }

  noteFallbackChunkForwarded(): void {
    this.fallbackChunkLog.count += 1;
    this.pageClientState = {
      ...this.pageClientState,
      chunkCount: (this.pageClientState.chunkCount || 0) + 1,
      worldReady: true
    };
    const now = Date.now();
    if (now - this.fallbackChunkLog.lastAt > 2000) {
      this.emit('log', `[BloxdPageClient] chunk-forwarded fallback x${this.fallbackChunkLog.count}`);
      this.fallbackChunkLog = { count: 0, lastAt: now };
    }
    this.emitStatus();
  }

  async dispatchInputAction(action: Record<string, unknown>): Promise<void> {
    const packetName = String(action.packetName || action.actionName || '');
    if (packetName === 'disconnect') {
      await this.releaseInputKeys();
      return;
    }
    if (packetName === 'CPacketMovePlayer') {
      const data = (action.data || {}) as Record<string, unknown>;
      await this.focusGameCanvas();
      await Promise.all([
        this.setInputKey('KeyW', Boolean(Number(data.speed || 0) > 0.05)),
        this.setInputKey('Space', Boolean(data.jumping)),
        this.setInputKey('ShiftLeft', Boolean(data.crouching)),
        this.setInputKey('ControlLeft', Boolean(Number(data.speed || 0) > 5))
      ]);
      this.movementLog.count += 1;
      this.movementLog.lastAction = action;
      const now = Date.now();
      if (now - this.movementLog.lastAt > 2000) {
        this.emit('log', `[BloxdPageClient] official-action-handled CPacketMovePlayer x${this.movementLog.count} via CDP input`);
        this.movementLog = { count: 0, lastAt: now, lastAction: action };
      }
      return;
    }
    if (packetName === 'CPacketChat') {
      const data = (action.data || {}) as Record<string, unknown>;
      const message = typeof data.msg === 'string' ? data.msg : '';
      if (!message) return;
      await this.focusGameCanvas();
      await this.dispatchKey('Enter', true);
      await this.dispatchKey('Enter', false);
      await this.window?.webContents.debugger.sendCommand('Input.insertText', { text: message }).catch(() => {});
      await this.dispatchKey('Enter', true);
      await this.dispatchKey('Enter', false);
      this.emit('log', '[BloxdPageClient] official-action-handled CPacketChat via CDP input');
      return;
    }
    if (packetName === 'CPacketSwingItem' || packetName === 'CPacketAttackEntity' || packetName === 'CPacketBreakBlock') {
      await this.dispatchMouse('mousePressed', 'left');
      await this.dispatchMouse('mouseReleased', 'left');
      this.emit('log', `[BloxdPageClient] official-action-handled ${packetName} via CDP mouse`);
      return;
    }
    if (packetName === 'CPacketUseItem' || packetName === 'CPacketStartUse' || packetName === 'CPacketFinishUse') {
      await this.dispatchMouse('mousePressed', 'right');
      await this.dispatchMouse('mouseReleased', 'right');
      this.emit('log', `[BloxdPageClient] official-action-handled ${packetName} via CDP mouse`);
      return;
    }
    if (packetName === 'CPacketSelectSlot') {
      const slot = Number(action.data);
      if (Number.isFinite(slot)) {
        const key = String(Math.max(1, Math.min(9, slot + 1)));
        await this.dispatchKey(`Digit${key}`, true, key);
        await this.dispatchKey(`Digit${key}`, false, key);
        this.emit('log', '[BloxdPageClient] official-action-handled CPacketSelectSlot via CDP input');
      }
      return;
    }
    throw new Error('No page-client input mapping yet');
  }

  private async focusGameCanvas(): Promise<void> {
    await this.evaluate(
      `(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          canvas.tabIndex = canvas.tabIndex || 0;
          canvas.focus();
          canvas.click();
          return true;
        }
        window.focus();
        return false;
      })()`,
      true
    ).catch(() => {});
  }

  private async setInputKey(code: string, down: boolean): Promise<void> {
    if (down && this.pressedInputKeys.has(code)) return;
    if (!down && !this.pressedInputKeys.has(code)) return;
    await this.dispatchKey(code, down);
    if (down) this.pressedInputKeys.add(code);
    else this.pressedInputKeys.delete(code);
  }

  private async releaseInputKeys(): Promise<void> {
    const keys = Array.from(this.pressedInputKeys);
    for (const code of keys) {
      await this.dispatchKey(code, false).catch(() => {});
    }
    this.pressedInputKeys.clear();
  }

  private async getPageBridgeState(): Promise<BloxdPageBridgeState> {
    if (!this.window || this.window.isDestroyed()) return {};
    await this.evaluate(INJECTED_PAGE_BRIDGE, false).catch(() => {});
    return await this.evaluate<BloxdPageBridgeState>(
      'window.__bloxdPageBridge ? window.__bloxdPageBridge.getState() : {}',
      false
    ).catch((): BloxdPageBridgeState => ({}));
  }

  private keyDescriptor(code: string, text?: string): { key: string; code: string; windowsVirtualKeyCode: number; text?: string } {
    const table: Record<string, { key: string; windowsVirtualKeyCode: number }> = {
      KeyW: { key: 'w', windowsVirtualKeyCode: 87 },
      Space: { key: ' ', windowsVirtualKeyCode: 32 },
      ShiftLeft: { key: 'Shift', windowsVirtualKeyCode: 16 },
      ControlLeft: { key: 'Control', windowsVirtualKeyCode: 17 },
      Enter: { key: 'Enter', windowsVirtualKeyCode: 13 },
      Digit1: { key: '1', windowsVirtualKeyCode: 49 },
      Digit2: { key: '2', windowsVirtualKeyCode: 50 },
      Digit3: { key: '3', windowsVirtualKeyCode: 51 },
      Digit4: { key: '4', windowsVirtualKeyCode: 52 },
      Digit5: { key: '5', windowsVirtualKeyCode: 53 },
      Digit6: { key: '6', windowsVirtualKeyCode: 54 },
      Digit7: { key: '7', windowsVirtualKeyCode: 55 },
      Digit8: { key: '8', windowsVirtualKeyCode: 56 },
      Digit9: { key: '9', windowsVirtualKeyCode: 57 }
    };
    const descriptor = table[code] || { key: text || code, windowsVirtualKeyCode: 0 };
    return { ...descriptor, code, text };
  }

  private async dispatchKey(code: string, down: boolean, text?: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const descriptor = this.keyDescriptor(code, text);
    await this.window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: down ? 'keyDown' : 'keyUp',
      key: descriptor.key,
      code: descriptor.code,
      windowsVirtualKeyCode: descriptor.windowsVirtualKeyCode,
      nativeVirtualKeyCode: descriptor.windowsVirtualKeyCode,
      text: down && text ? text : undefined,
      unmodifiedText: down && text ? text : undefined
    });
  }

  private async dispatchMouse(type: 'mousePressed' | 'mouseReleased', button: 'left' | 'right'): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.window.getBounds();
    await this.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      button,
      x: Math.max(1, Math.floor(bounds.width / 2)),
      y: Math.max(1, Math.floor(bounds.height / 2)),
      clickCount: type === 'mousePressed' ? 1 : 0
    });
  }

  async doMatchmake(contents: MatchmakeContents): Promise<MatchmakeResult> {
    const consumed = this.consumeLastMatchmakeResult(contents);
    if (consumed) {
      this.emit('log', `[BloxdCDP] Using captured official matchmake result: ${consumed.gameNameWithVariation ?? 'game'} lobby ${consumed.lobbyName ?? '?'} on ${consumed.gameServerHost}`);
      return {
        status: consumed.status,
        body: consumed.body,
        matchmakeUrl: consumed.matchmakeUrl,
        gameServerHost: consumed.gameServerHost,
        lobbyName: consumed.lobbyName,
        gameNameWithVariation: consumed.gameNameWithVariation
      };
    }

    await this.waitReady();
    const result = await this.evaluate<MatchmakeResult>(
      `window.__bloxdCdpProxy.doMatchmake(${JSON.stringify(contents || {})})`,
      true
    );
    if (result.status >= 200 && result.status < 300) {
      this.storeMatchmakeResult(result.status, result.body, result.matchmakeUrl);
      this.scheduleRelease('proxy matchmake completed');
    }
    await this.refreshPageStatus().catch(() => {});
    return result;
  }

  async waitForOfficialMatchmake(timeoutMs = 60000): Promise<MatchmakeCapture | null> {
    if (this.lastMatchmake) return this.publicMatchmake(this.lastMatchmake);
    await this.ensureWindow(true);
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.matchmakeWaiters = this.matchmakeWaiters.filter((waiter) => waiter.timer !== timer);
        resolve(null);
      }, timeoutMs);
      this.matchmakeWaiters.push({ resolve, timer });
    });
  }

  getLastMatchmakeResult(): MatchmakeCapture | null {
    return this.lastMatchmake ? this.publicMatchmake(this.lastMatchmake) : null;
  }

  consumeLastMatchmakeResult(contents?: MatchmakeContents): (MatchmakeCapture & { body: string; status: number; statusText?: string }) | null {
    if (!this.lastMatchmake) return null;
    if (!this.matchesCapture(this.lastMatchmake, contents)) return null;
    const result = this.lastMatchmake;
    this.lastMatchmake = undefined;
    this.emitStatus();
    return result;
  }

  async releaseGamePage(reason = 'manual release'): Promise<BloxdStatus> {
    await this.evaluate<boolean>('window.__bloxdCdpProxy && window.__bloxdCdpProxy.releaseGamePage && window.__bloxdCdpProxy.releaseGamePage()', true).catch(() => false);
    this.released = true;
    this.inGameDetected = false;
    this.status = 'released';
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
    debug.sendCommand('Fetch.enable', {
      patterns: [
        { urlPattern: '*://bloxd.io/static/js/*', requestStage: 'Response' }
      ]
    }).catch((err) => this.emit('log', `[BloxdProbe] Fetch interception unavailable: ${err instanceof Error ? err.message : String(err)}`));
    debug.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_PACKET_PROBE }).catch((err) => this.setError(err));
    debug.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_PROXY }).catch((err) => this.setError(err));
    debug.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_PAGE_BRIDGE }).catch((err) => this.setError(err));
    debug.on('message', (_event, method, params) => {
      if (method === 'Fetch.requestPaused') {
        this.handleFetchRequestPaused(params).catch((err) => this.emit('log', `[BloxdProbe] Fetch interception failed: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }
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
        this.readMatchmakeResponse(params.requestId, params.response.status, params.response.url).catch((err) => this.emit('log', `[BloxdCDP] Failed reading matchmake response: ${err}`));
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

  private async handleFetchRequestPaused(params: any): Promise<void> {
    const requestId = params?.requestId;
    const url = String(params?.request?.url || '');
    if (!requestId) return;
    if (!url.includes('/static/js/') || !url.endsWith('.js')) {
      await this.window?.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId }).catch(() => {});
      return;
    }

    const debuggerApi = this.window?.webContents.debugger;
    if (!debuggerApi || !debuggerApi.isAttached()) return;

    try {
      const response = await debuggerApi.sendCommand('Fetch.getResponseBody', { requestId });
      if (!response || typeof response.body !== 'string') {
        await debuggerApi.sendCommand('Fetch.continueRequest', { requestId }).catch(() => {});
        return;
      }

      const source = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
      const patched = this.patchWebpackBundleForProbe(source, url);
      if (patched === source) {
        await debuggerApi.sendCommand('Fetch.continueRequest', { requestId }).catch(() => {});
        return;
      }

      const headers = (params.responseHeaders || [])
        .filter((header: { name?: string }) => !['content-length', 'content-encoding'].includes(String(header.name || '').toLowerCase()));
      headers.push({ name: 'content-type', value: 'application/javascript; charset=utf-8' });

      await debuggerApi.sendCommand('Fetch.fulfillRequest', {
        requestId,
        responseCode: params.responseStatusCode || 200,
        responsePhrase: params.responseStatusText || 'OK',
        responseHeaders: headers,
        body: Buffer.from(patched, 'utf8').toString('base64')
      });
      this.emit('log', `[BloxdProbe] Patched webpack bundle for decoder probe: ${url.split('/').pop()}`);
    } catch (err) {
      await debuggerApi.sendCommand('Fetch.continueRequest', { requestId }).catch(() => {});
      throw err;
    }
  }

  private patchWebpackBundleForProbe(source: string, url: string): string {
    if (!source.includes('.m=') || !source.includes('.c=')) return source;
    if (source.includes('__bloxdPacketProbeRememberRequire')) return source;
    const patched = source.replace(
      /return ([A-Za-z_$][\w$]*)\.m=([A-Za-z_$][\w$]*),\1\.c=([A-Za-z_$][\w$]*),/,
      (_match, requireName, modulesName, cacheName) => {
        return `return ${requireName}.m=${modulesName},${requireName}.c=${cacheName},window.__bloxdPacketProbeRememberRequire&&window.__bloxdPacketProbeRememberRequire(${requireName},"bundle-bootstrap:${url.split('/').pop()}"),`;
      }
    );
    if (patched !== source) return patched;
    return source;
  }

  private markInGame(reason: string, url?: string): void {
    this.inGameDetected = true;
    this.emit('log', `[BloxdCDP] Game connection detected by ${reason}${url ? `: ${url}` : ''}${this.pageClientMode ? ' (page-client keeps it alive)' : ''}`);
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
    if (kind === 'module-hint' || kind === 'socket-created' || kind === 'socket-frame' || kind === 'official-packet-decoded' || kind === 'official-packet-decode-error' || kind === 'webpack-require-seen' || kind === 'decoder-exports-candidate') {
      this.emit('log', `[BloxdProbe] ${kind} written to ${this.getPacketProbeFile()}`);
    }
    if (kind === 'official-packet' && typeof event.packetId === 'number' && typeof event.officialBinary === 'boolean') {
      this.officialPacketMap.set(event.packetId, event.officialBinary);
      this.writeOfficialPacketMap();
      this.emit('official-packet', { packetId: event.packetId, officialBinary: event.officialBinary });
    }
    if (kind === 'official-packet-decoded' && typeof event.packetId === 'number') {
      this.officialPacketMap.set(event.packetId, true);
      this.writeOfficialPacketMap();
      this.emit('official-packet', { packetId: event.packetId, officialBinary: true });
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

  private async readMatchmakeResponse(requestId: string, status = 0, matchmakeUrl?: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const response = await this.window.webContents.debugger.sendCommand('Network.getResponseBody', { requestId }).catch(() => undefined);
    if (!response || typeof response.body !== 'string') return;
    let bodyText = response.body;
    if (response.base64Encoded) {
      bodyText = Buffer.from(response.body, 'base64').toString('utf8');
    }
    this.storeMatchmakeResult(status, bodyText, matchmakeUrl);
  }

  private storeMatchmakeResult(status: number, bodyText: string, matchmakeUrl?: string): void {
    let parsed: { gameServerHost?: string; lobbyName?: string; gameNameWithVariation?: string; error?: string };
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return;
    }
    if (!parsed.gameServerHost) {
      if (parsed.error) {
        this.lastError = parsed.error;
        this.emit('log', `[BloxdCDP] Matchmake returned error: ${parsed.error}`);
        this.emitStatus();
      }
      return;
    }

    this.knownGameServerHost = parsed.gameServerHost;
    this.lastMatchmake = {
      gameServerHost: parsed.gameServerHost,
      lobbyName: parsed.lobbyName,
      gameNameWithVariation: parsed.gameNameWithVariation,
      matchmakeUrl,
      capturedAt: Date.now(),
      body: bodyText,
      status,
      statusText: 'OK'
    };
    this.emit('log', `[BloxdCDP] Captured official matchmake result: ${parsed.gameNameWithVariation ?? 'game'} lobby ${parsed.lobbyName ?? '?'} on ${parsed.gameServerHost}`);
    this.resolveMatchmakeWaiters();
    this.scheduleRelease('matchmake response');
    this.emitStatus();
  }

  private resolveMatchmakeWaiters(): void {
    if (!this.lastMatchmake) return;
    const capture = this.publicMatchmake(this.lastMatchmake);
    const waiters = this.matchmakeWaiters.splice(0);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(capture);
    }
  }

  private handlePageBridgeConsole(message: string): void {
    const marker = '[BloxdPageBridge] ';
    const markerIndex = message.indexOf(marker);
    if (markerIndex < 0) return;
    const jsonText = message.slice(markerIndex + marker.length).trim();
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      event = { kind: 'parse-error', message };
    }
    const kind = typeof event.kind === 'string' ? event.kind : 'event';
    if (kind === 'game-socket-opened') {
      this.inGameDetected = true;
      this.pageClientState = {
        ...this.pageClientState,
        connected: true,
        gameSocketConnected: true,
        lastGameSocketUrl: typeof event.url === 'string' ? event.url : undefined
      } as BloxdPageBridgeState;
      this.emit('log', `[BloxdPageClient] Official page owns game socket: ${String(event.url || '')}`);
      this.emitStatus();
    } else if (kind === 'game-socket-closed') {
      this.inGameDetected = false;
      this.pageClientState = {
        ...this.pageClientState,
        connected: false,
        gameSocketConnected: false
      };
      this.emit('log', '[BloxdPageClient] Official page game socket closed');
      this.currentPageClient?.emit('SPacketKick', 'Bloxd official page disconnected.');
      this.emitStatus();
    } else if (kind === 'action') {
      const packetName = typeof event.packetName === 'string' ? event.packetName : String(event.actionName || 'action');
      if (packetName !== 'CPacketMovePlayer') {
        const handled = event.handled === true ? 'official-action-handled' : 'official-action-missing';
        this.emit('log', `[BloxdPageClient] ${handled} ${packetName}`);
      }
    }
  }

  private publicMatchmake(result: MatchmakeCapture): MatchmakeCapture {
    return {
      gameServerHost: result.gameServerHost,
      lobbyName: result.lobbyName,
      gameNameWithVariation: result.gameNameWithVariation,
      matchmakeUrl: result.matchmakeUrl,
      capturedAt: result.capturedAt
    };
  }

  private matchesCapture(capture: MatchmakeCapture, contents?: MatchmakeContents): boolean {
    if (!contents) return true;
    if (contents.gameNameWithVariation && capture.gameNameWithVariation && contents.gameNameWithVariation !== capture.gameNameWithVariation) return false;
    if (contents.lobbyNameOrDiscordContext && capture.lobbyName && String(contents.lobbyNameOrDiscordContext) !== String(capture.lobbyName)) return false;
    return true;
  }

  private async installHelper(): Promise<void> {
    await this.evaluate(INJECTED_PACKET_PROBE, false).catch(() => {});
    await this.evaluate(INJECTED_PROXY, false);
    await this.evaluate(INJECTED_PAGE_BRIDGE, false).catch(() => {});
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

  private async waitForGameConnection(timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.inGameDetected) return;
      const bridgeState = await this.evaluate<{ connected?: boolean }>(
        'window.__bloxdPageBridge ? window.__bloxdPageBridge.getState() : {}',
        false
      ).catch((): { connected?: boolean } => ({}));
      if (bridgeState.connected) {
        this.inGameDetected = true;
        this.emitStatus();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Matchmake was captured, but no official Bloxd game socket was observed yet.');
  }

  private async refreshPageStatus(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const pageStatus = await this.evaluate<{ lastError?: string; released?: boolean; inGameDetected?: boolean; gameServerHost?: string }>(
      'window.__bloxdCdpProxy ? window.__bloxdCdpProxy.getStatus() : {}',
      false
    );
    this.released = Boolean(pageStatus.released || this.released);
    this.inGameDetected = Boolean(pageStatus.inGameDetected);
    if (pageStatus.gameServerHost) this.knownGameServerHost = pageStatus.gameServerHost;
    this.lastError = pageStatus.lastError;
    this.status = this.released ? 'released' : 'ready';
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
