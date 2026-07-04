const { metrics, matchmaking, browser, version, languages: defaultLanguages } = require('./types/browser_info.js');

const HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Origin': 'https://bloxd.io',
  'Referer': 'https://bloxd.io/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site'
};

const SOCIAL_HOSTS = Array.from({ length: 29 }, (_, i) => `social${i + 1}.bloxd.io`);
const REDACTED_KEYS = new Set(['3PSIDMC', '3PSIDMCPP', '3PSIDMCSP', 'trafficCode']);

function hashCode(input) {
  let result = 0;
  if (!input) return result;
  for (let i = 0; i < input.length; i++) {
    result = ((result << 5) - result + input.charCodeAt(i)) | 0;
  }
  return result;
}

function hostFromHint(hint) {
  if (typeof hint === 'number' && Number.isFinite(hint)) {
    const index = Math.max(1, Math.min(29, Math.floor(hint)));
    return `social${index}.bloxd.io`;
  }
  if (typeof hint === 'string' && hint.trim()) {
    const trimmed = hint.trim();
    if (/^social\d+\.bloxd\.io$/i.test(trimmed)) return trimmed.toLowerCase();
    if (/^\d+$/.test(trimmed)) return hostFromHint(Number(trimmed));
    const index = Math.abs(hashCode(trimmed)) % 29;
    return SOCIAL_HOSTS[index];
  }
  return undefined;
}

function getOrderedHosts(options = {}) {
  const preferred = hostFromHint(options.socialHost || options.socialId || options.whamm || options.socialWhamm);
  if (!preferred) return SOCIAL_HOSTS;
  return [preferred, ...SOCIAL_HOSTS.filter((host) => host !== preferred)];
}

function redactValue(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 12) return '<redacted>';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function redactObject(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactObject);
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key) ? redactValue(entry) : redactObject(entry);
  }
  return out;
}

function normalizeContents(contents = {}, languages) {
  const gameNameWithVariation = contents.gameNameWithVariation || contents.gameName || 'skywars';
  const out = {
    gameNameWithVariation,
    languages: Array.isArray(languages) && languages.length ? languages : defaultLanguages
  };
  if (contents.lobbyNameOrDiscordContext != null && String(contents.lobbyNameOrDiscordContext).trim() !== '') {
    out.lobbyNameOrDiscordContext = contents.lobbyNameOrDiscordContext;
  }
  return out;
}

function buildCookieHeader(activeMetrics, cookies = {}) {
  const parts = [];
  if (activeMetrics['3PSIDMC']) parts.push(`___Secure-3PSIDMC=${activeMetrics['3PSIDMC']}`);
  if (activeMetrics['3PSIDMCPP']) parts.push(`___Secure-3PSIDMCPP=${activeMetrics['3PSIDMCPP']}`);
  if (activeMetrics['3PSIDMCSP']) parts.push(`___Secure-3PSIDMCSP=${activeMetrics['3PSIDMCSP']}`);
  if (cookies.bb_u_id) parts.push(`bb_u_id=${cookies.bb_u_id}`);
  if (cookies.bb_u_h_init) parts.push(`bb_u_h_init=${cookies.bb_u_h_init}`);
  return parts.join('; ');
}

async function postSocialMatchmake(host, contents, options = {}) {
  const url = `https://${host}/social/bloxd-matchmake`;
  const activeMetrics = options.metrics || metrics;
  const cookieHeader = options.cookieHeader || buildCookieHeader(activeMetrics, options.cookies);
  const headers = { ...HEADERS };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const body = {
    metricsCookies: activeMetrics,
    contents
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text().catch(() => '');

  return { res, text, url, body };
}

async function socialMatchmake(gameName, languages, options = {}) {
  const contents = normalizeContents({ gameNameWithVariation: gameName }, languages);
  const hosts = getOrderedHosts(options);
  const maxHosts = options.maxHosts || hosts.length;
  let lastFailure;

  for (const host of hosts.slice(0, maxHosts)) {
    const { res, text, url, body } = await postSocialMatchmake(host, contents, options);
    if (options.logger) {
      options.logger(`[BrowserlessMatchmake] ${res.status} ${url} body=${JSON.stringify(redactObject(body))}`);
    }

    if (!res.ok) {
      lastFailure = new Error(`Browserless bloxd-matchmake rejected: ${res.status} ${res.statusText} ${text}`);
      lastFailure.status = res.status;
      lastFailure.statusText = res.statusText;
      lastFailure.url = url;
      lastFailure.body = text;
      if (res.status === 400 || res.status === 401 || res.status === 403) break;
      continue;
    }

    const data = JSON.parse(text);
    if (!data.succeeded) {
      lastFailure = new Error(`Social matchmake returned not succeeded: ${text}`);
      lastFailure.status = res.status;
      lastFailure.url = url;
      lastFailure.body = text;
      continue;
    }
    return data;
  }

  throw lastFailure || new Error('Browserless bloxd-matchmake failed before a request was sent');
}

async function doMatchmake(contents = {}, options = {}) {
  const activeContents = normalizeContents(contents, options.languages);
  const hosts = getOrderedHosts(options);
  const maxHosts = options.maxHosts || hosts.length;
  let lastFailure;

  for (const host of hosts.slice(0, maxHosts)) {
    const result = await postSocialMatchmake(host, activeContents, options);
    const { res, text, url, body } = result;
    if (options.logger) {
      options.logger(`[BrowserlessMatchmake] status=${res.status} url=${url} fields=${Object.keys(body).join(',')} contents=${JSON.stringify(activeContents)}`);
    }

    if (res.ok) {
      return {
        status: res.status,
        body: text,
        matchmakeUrl: url,
        sentBody: JSON.stringify(redactObject(body))
      };
    }

    lastFailure = {
      status: res.status,
      body: text,
      matchmakeUrl: url,
      sentBody: JSON.stringify(redactObject(body)),
      error: `Browserless bloxd-matchmake rejected with ${res.status} ${res.statusText}. Bloxd may be rejecting Node transport without a browser.`
    };
    if (res.status === 400 || res.status === 401 || res.status === 403) break;
  }

  return lastFailure || {
    status: 0,
    body: '',
    error: 'Browserless bloxd-matchmake failed before a request was sent.'
  };
}

async function joinRoom(gameServerHost, gameName, lobbyName, languages) {
  const url = `https://${gameServerHost}/matchmake/joinOrCreate/${gameName}`;

  const body = {
    cookies: { origin: 'classic' },
    isMobile: false,
    generalCookies: {
      joinDiscord: false,
      newGo: 'c',
      ...metrics,
      trafficCode: matchmaking.trafficCode,
      compliance: matchmaking.compliance
    },
    browserInfo: browser,
    isLoggedIn: false,
    lobbyName: lobbyName,
    languages: languages || defaultLanguages,
    version: version,
    siteUsed: 'bloxd',
    subsiteUsed: 'bloxd'
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Host': gameServerHost,
      'X-Requested-With': 'XMLHtttpRequest'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Join room failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = await res.json();

  if (data.code && data.code >= 4000) {
    const err = new Error(`Join room error ${data.code}: ${data.error}`);
    err.code = data.code;
    throw err;
  }

  return data;
}

async function matchmake(gameName, options = {}) {
  const activeLanguages = options.languages || defaultLanguages;
  const maxRetries = options.maxRetries || 3;
  const socialProvider = options.socialProvider;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let social;
      if (typeof socialProvider === 'function') {
        social = await socialProvider(gameName, activeLanguages);
      } else {
        social = await socialMatchmake(gameName, activeLanguages);
      }

      const room = await joinRoom(
        social.gameServerHost,
        gameName,
        social.lobbyName,
        activeLanguages
      );

      return {
        gameName,
        lobbyName: social.lobbyName,
        gameServerHost: social.gameServerHost,
        roomId: room.room?.roomId,
        sessionId: room.sessionId,
        processId: room.room?.processId,
        room: room.room
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Matchmaking failed after all retries');
}

async function fromSocialResult(socialResult, gameName, languages) {
  const room = await joinRoom(
    socialResult.gameServerHost,
    gameName,
    socialResult.lobbyName,
    languages || defaultLanguages
  );

  return {
    gameName,
    lobbyName: socialResult.lobbyName,
    gameServerHost: socialResult.gameServerHost,
    roomId: room.room?.roomId,
    sessionId: room.sessionId,
    processId: room.room?.processId,
    room: room.room
  };
}

module.exports = {
  matchmake,
  socialMatchmake,
  joinRoom,
  fromSocialResult,
  doMatchmake,
  normalizeContents,
  redactObject,
  getOrderedHosts,
  buildCookieHeader
};
