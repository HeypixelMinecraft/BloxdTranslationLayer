import { BrowserWindow, app, ipcMain } from 'electron';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { BloxdCdpProvider } from './bloxd-cdp-provider';
import * as accounts from './accounts';
import type { AccountImportInput, AccountInfo, AppStatus, LogEntry, Settings } from '../shared/types';

const require = createRequire(import.meta.url);
const appRoot = path.resolve(__dirname, '..');
const { createService } = require(path.join(appRoot, 'server.js'));
const browserInfo = require(path.join(appRoot, 'bloxd/types/browser_info.js'));
const BloxClient = require(path.join(appRoot, 'bloxd/client.js'));

const settingsPath = path.join(process.cwd(), 'settings.json');
const service = createService();
const bloxdProvider = new BloxdCdpProvider();
const logs: LogEntry[] = [];
let mainWindow: BrowserWindow | undefined;
let nextLogId = 1;

service.setRuntimeMode?.('page-client');
service.setPageRuntimeProvider?.(bloxdProvider);
browserInfo.setBrowserlessMode?.(false);
browserInfo.registerMatchmakeProvider?.(bloxdProvider);

function redact(value: string): string {
  return value
    .replace(/("3PSIDMC"\s*:\s*")[^"]+/g, '$1<redacted>')
    .replace(/("3PSIDMCPP"\s*:\s*")[^"]+/g, '$1<redacted>')
    .replace(/("3PSIDMCSP"\s*:\s*")[^"]+/g, '$1<redacted>')
    .replace(/("trafficCode"\s*:\s*")[^"]+/g, '$1<redacted>');
}

function pushLog(level: LogEntry['level'], message: string): void {
  const entry: LogEntry = {
    id: nextLogId++,
    time: new Date().toLocaleTimeString(),
    level,
    message: redact(message),
  };
  logs.push(entry);
  if (logs.length > 1000) logs.shift();
  mainWindow?.webContents.send('logs:entry', entry);
}

function patchConsole(): void {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args: unknown[]) => {
    original.log(...args);
    pushLog('info', args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    pushLog('warn', args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    original.error(...args);
    pushLog('error', args.map(String).join(' '));
  };
}

function readSettings(): Settings {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Settings;
}

function writeSettings(settings: Settings): Settings {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return readSettings();
}

function getStatus(): AppStatus {
  return {
    service: service.getState(),
    bloxd: bloxdProvider.getStatus(),
  };
}

function emitStatus(): void {
  mainWindow?.webContents.send('status:update', getStatus());
}

function applyAccountToRuntime(acc: AccountInfo): void {
  browserInfo.metrics['3PSIDMC'] = acc.token3PSIDMC || browserInfo.metrics['3PSIDMC'];
  if (acc.token3PSIDMCPP) browserInfo.metrics['3PSIDMCPP'] = acc.token3PSIDMCPP;
  if (acc.token3PSIDMCSP) browserInfo.metrics['3PSIDMCSP'] = acc.token3PSIDMCSP;
  browserInfo.matchmaking.trafficCode = acc.trafficCode || '';
  browserInfo.cookies = acc.cookies || {};
  if (acc.name) browserInfo.user.name = acc.name;
}

function escapeHtml(input: string): string {
  return input.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch] ?? ch);
}

function errorHtml(title: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{margin:0;background:#101317;color:#f5f5f5;font-family:Segoe UI,system-ui,sans-serif}
    main{padding:32px;max-width:860px}
    pre{white-space:pre-wrap;background:#181d24;border:1px solid #303846;border-radius:8px;padding:16px;color:#ffb3b3}
  </style></head><body><main><h1>${title}</h1><p>Electron UI 启动失败，下面是可见错误信息。</p><pre>${escapeHtml(detail)}</pre></main></body></html>`;
}

async function showWindowError(title: string, detail: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(title, detail))}`).catch(() => {});
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: 'Bloxd Translation Layer',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(appRoot, 'dist-preload/index.js'),
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    pushLog('error', `[Window] failed to load ${url}: ${code} ${description}`);
    showWindowError('窗口加载失败', `${url}\n${code} ${description}`).catch(() => {});
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    pushLog('error', `[Window] renderer process gone: ${details.reason}`);
    showWindowError('渲染进程已退出', JSON.stringify(details, null, 2)).catch(() => {});
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    pushLog('error', `[Window] preload failed: ${preloadPath} ${error.message}`);
    showWindowError('预加载失败', `${preloadPath}\n${error.stack || error.message}`).catch(() => {});
  });

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      await mainWindow.loadFile(path.join(appRoot, 'dist-renderer/index.html'));
    }
  } catch (err) {
    await showWindowError('窗口加载失败', err instanceof Error ? err.stack || err.message : String(err));
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

function ensureStartableAccount(): void {
  const state = service.getState();
  if (state.runtimeMode === 'page-client') {
    bloxdProvider.setPageClientMode(true);
    return;
  }
  const current = accounts.getCurrentAccount();
  if (!current) throw new Error('请先导入账号令牌，确保 Node join 使用同一账号。');
  if (!current.trafficCode) throw new Error('当前账号缺少 trafficCode，请导入包含 trafficCode 的 login.json。');
  if (current.expireTime && current.expireTime <= Date.now()) {
    throw new Error('当前账号令牌已过期，请重新导入有效 login.json。');
  }
  applyAccountToRuntime(current);
  if (!bloxdProvider.getLastMatchmakeResult()) {
    throw new Error('请先打开 Bloxd 页面并点一次 Play，等待捕获 serverhost 后再开始转译。');
  }
}

function accountFromLoginJson(fallback: AccountInfo): AccountInfo {
  const loginJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'login.json'), 'utf8'));
  return {
    ...fallback,
    name: browserInfo.user?.name || fallback.name,
    token3PSIDMC: loginJson['3PSIDMC'] || fallback.token3PSIDMC,
    token3PSIDMCPP: browserInfo.metrics['3PSIDMCPP'] || fallback.token3PSIDMCPP,
    token3PSIDMCSP: browserInfo.metrics['3PSIDMCSP'] || fallback.token3PSIDMCSP,
    trafficCode: loginJson.trafficCode || fallback.trafficCode,
    expireTime: loginJson.expireTime || fallback.expireTime,
    cookies: loginJson.cookies || fallback.cookies,
    isActive: true,
  };
}

function registerIpc(): void {
  ipcMain.handle('service:start', async () => {
    ensureStartableAccount();
    const state = await service.start();
    emitStatus();
    return state;
  });
  ipcMain.handle('service:stop', async () => {
    const state = await service.stop();
    emitStatus();
    return state;
  });
  ipcMain.handle('service:restart', async () => {
    ensureStartableAccount();
    const state = await service.restart();
    emitStatus();
    return state;
  });
  ipcMain.handle('service:get-status', () => getStatus());
  ipcMain.handle('bloxd:show', async () => {
    const status = await bloxdProvider.show();
    emitStatus();
    return status;
  });
  ipcMain.handle('bloxd:hide', async () => {
    const status = await bloxdProvider.hide();
    emitStatus();
    return status;
  });
  ipcMain.handle('bloxd:reload', async () => {
    const status = await bloxdProvider.reload();
    emitStatus();
    return status;
  });
  ipcMain.handle('bloxd:get-status', () => bloxdProvider.getStatus());
  ipcMain.handle('matchmake:wait-capture', async (_event, timeoutMs?: number) => {
    const capture = await bloxdProvider.waitForOfficialMatchmake(timeoutMs || 60000);
    emitStatus();
    return capture;
  });
  ipcMain.handle('matchmake:get-last', () => bloxdProvider.getLastMatchmakeResult());
  ipcMain.handle('matchmake:test', async (_event, timeoutMs?: number) => {
    const capture = await bloxdProvider.waitForOfficialMatchmake(typeof timeoutMs === 'number' ? timeoutMs : 60000);
    return {
      ok: Boolean(capture),
      status: capture ? 200 : 0,
      statusText: capture ? 'Captured' : 'Timeout',
      body: capture ? JSON.stringify(capture) : 'No official bloxd-matchmake response captured.',
    };
  });
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:update', (_event, settings: Settings) => writeSettings(settings));
  ipcMain.handle('logs:clear', () => {
    logs.splice(0, logs.length);
    mainWindow?.webContents.send('logs:cleared');
  });

  ipcMain.handle('accounts:list', () => accounts.listAccounts());
  ipcMain.handle('accounts:current', () => accounts.getCurrentAccount());
  ipcMain.handle('accounts:switch', (_event, name: string) => {
    const acc = accounts.switchAccount(name);
    applyAccountToRuntime(acc);
    return acc;
  });
  ipcMain.handle('accounts:delete', (_event, name: string) => {
    accounts.deleteAccount(name);
  });
  ipcMain.handle('accounts:import', (_event, input: AccountImportInput) => {
    const acc = accounts.importAccount(input.raw, input.name);
    applyAccountToRuntime(acc);
    pushLog('info', `[Accounts] Imported account: ${acc.name}`);
    emitStatus();
    return acc;
  });
  ipcMain.handle('accounts:validate', async (_event, name?: string) => {
    const acc = name ? accounts.switchAccount(name) : accounts.getCurrentAccount();
    if (!acc) throw new Error('没有可校验的账号。');
    applyAccountToRuntime(acc);
    await browserInfo.gen3PSIDMCPP(false);
    const updated = accountFromLoginJson(acc);
    accounts.saveAccount(updated);
    pushLog('info', `[Accounts] Validated account: ${updated.name}`);
    return updated;
  });
  ipcMain.handle('accounts:refresh-tokens', async (_event, name: string) => {
    const acc = accounts.switchAccount(name);
    applyAccountToRuntime(acc);
    await browserInfo.gen3PSIDMCPP(false);
    const updated = accountFromLoginJson(acc);
    accounts.saveAccount(updated);
    pushLog('info', `[Accounts] Refreshed tokens for: ${updated.name}`);
    return updated;
  });
}

service.on('status', emitStatus);
service.on('minecraft-client', emitStatus);
bloxdProvider.on('status', emitStatus);
bloxdProvider.on('log', (message) => pushLog('info', String(message)));
bloxdProvider.on('official-packet', (event: { packetId: number; officialBinary: boolean }) => {
  if (typeof BloxClient.updateOfficialPacketHint === 'function') {
    BloxClient.updateOfficialPacketHint(event.packetId, event.officialBinary);
  }
});

patchConsole();
registerIpc();

app.whenReady().then(async () => {
  accounts.migrateLegacyLogin();
  const current = accounts.getCurrentAccount();
  if (current) applyAccountToRuntime(current);
  await createMainWindow();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (service.getState().status === 'running') {
    event.preventDefault();
    await service.stop().catch(() => {});
    app.quit();
  }
});
