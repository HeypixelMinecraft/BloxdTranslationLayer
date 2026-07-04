import fs from 'node:fs';
import path from 'node:path';
import type { AccountInfo } from '../shared/types';

const ACCOUNTS_DIR = path.join(process.cwd(), 'accounts');
const LOGIN_PATH = path.join(process.cwd(), 'login.json');

function ensureAccountsDir(): void {
  if (!fs.existsSync(ACCOUNTS_DIR)) {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  }
}

function accountFilePath(name: string): string {
  return path.join(ACCOUNTS_DIR, `${sanitizeName(name)}.json`);
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

function readLoginJson(): Record<string, unknown> | null {
  if (!fs.existsSync(LOGIN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOGIN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeLoginJson(data: Record<string, unknown>): void {
  fs.writeFileSync(LOGIN_PATH, JSON.stringify(data));
}

function deleteLoginJson(): void {
  if (fs.existsSync(LOGIN_PATH)) {
    fs.unlinkSync(LOGIN_PATH);
  }
}

function loginDataToAccount(data: Record<string, unknown>, name?: string): AccountInfo {
  const metrics = (data.metricsCookies as Record<string, string>) || {};
  const cookies = (data.cookies as Record<string, string>) || {};
  return {
    name: name || (data.name as string) || (data.username as string) || 'Imported Account',
    token3PSIDMC: (data['3PSIDMC'] as string) || (data['___Secure-3PSIDMC'] as string) || metrics['3PSIDMC'] || cookies['___Secure-3PSIDMC'] || '',
    token3PSIDMCPP: (data['3PSIDMCPP'] as string) || (data['___Secure-3PSIDMCPP'] as string) || metrics['3PSIDMCPP'] || cookies['___Secure-3PSIDMCPP'] || '',
    token3PSIDMCSP: (data['3PSIDMCSP'] as string) || (data['___Secure-3PSIDMCSP'] as string) || metrics['3PSIDMCSP'] || cookies['___Secure-3PSIDMCSP'] || '',
    trafficCode: (data.trafficCode as string) || '',
    expireTime: (data.expireTime as number) || 0,
    cookies,
    socialId: data.socialId as number | undefined,
    socialHost: data.socialHost as string | undefined,
    whamm: data.whamm as string | undefined,
    languages: Array.isArray(data.languages) ? data.languages as string[] : undefined,
    isActive: false,
  };
}

function accountToLoginData(acc: AccountInfo): Record<string, unknown> {
  return {
    '3PSIDMC': acc.token3PSIDMC,
    '3PSIDMCPP': acc.token3PSIDMCPP,
    '3PSIDMCSP': acc.token3PSIDMCSP,
    trafficCode: acc.trafficCode,
    expireTime: acc.expireTime,
    cookies: acc.cookies,
    name: acc.name,
    socialId: acc.socialId,
    socialHost: acc.socialHost,
    whamm: acc.whamm,
    languages: acc.languages,
  };
}

function readAccountFile(name: string): AccountInfo | null {
  const filePath = accountFilePath(name);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ...data, isActive: false };
  } catch {
    return null;
  }
}

function writeAccountFile(acc: AccountInfo): void {
  ensureAccountsDir();
  const { isActive, ...data } = acc;
  fs.writeFileSync(accountFilePath(acc.name), JSON.stringify(data, null, 2));
}

export function listAccounts(): AccountInfo[] {
  ensureAccountsDir();
  const activeName = getActiveAccountName();
  const files = fs.readdirSync(ACCOUNTS_DIR).filter((f) => f.endsWith('.json'));
  const accounts: AccountInfo[] = [];
  for (const file of files) {
    const filePath = path.join(ACCOUNTS_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      accounts.push({ ...data, isActive: data.name === activeName });
    } catch {
      // skip corrupted files
    }
  }
  return accounts;
}

export function getActiveAccountName(): string | null {
  const loginData = readLoginJson();
  if (!loginData) return null;
  if (loginData.name) return loginData.name as string;
  return null;
}

export function getCurrentAccount(): AccountInfo | null {
  const activeName = getActiveAccountName();
  if (!activeName) {
    const loginData = readLoginJson();
    if (!loginData) return null;
    const acc = loginDataToAccount(loginData);
    acc.isActive = true;
    return acc;
  }
  const acc = readAccountFile(activeName);
  if (!acc) {
    const loginData = readLoginJson();
    if (loginData) {
      const fallback = loginDataToAccount(loginData, activeName);
      fallback.isActive = true;
      return fallback;
    }
    return null;
  }
  acc.isActive = true;
  return acc;
}

export function switchAccount(name: string): AccountInfo {
  const acc = readAccountFile(name);
  if (!acc) throw new Error(`Account '${name}' not found`);
  writeLoginJson(accountToLoginData(acc));
  return { ...acc, isActive: true };
}

export function deleteAccount(name: string): void {
  const filePath = accountFilePath(name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (getActiveAccountName() === name) {
    const next = listAccounts().find((acc) => acc.name !== name);
    if (next) {
      writeLoginJson(accountToLoginData(next));
    } else {
      deleteLoginJson();
    }
  }
}

export function saveAccount(acc: AccountInfo): void {
  writeAccountFile(acc);
  writeLoginJson(accountToLoginData(acc));
}

function parseImportText(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('导入内容为空');
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  const data: Record<string, unknown> = {};
  for (const line of trimmed.split(/\r?\n|;/)) {
    const [rawKey, ...rest] = line.split('=');
    const key = rawKey?.trim();
    const value = rest.join('=').trim();
    if (!key || !value) continue;
    data[key] = value;
  }
  if (Object.keys(data).length === 0) {
    throw new Error('无法识别导入内容，请粘贴 login.json 或 key=value cookie/token');
  }
  return data;
}

export function importAccount(raw: string, preferredName?: string): AccountInfo {
  const parsed = parseImportText(raw);
  if (preferredName?.trim()) parsed.name = preferredName.trim();
  const acc = loginDataToAccount(parsed);
  if (!acc.token3PSIDMC) {
    throw new Error('导入内容缺少 3PSIDMC');
  }
  if (!acc.expireTime) {
    acc.expireTime = Date.now() + 6048e5;
  }
  saveAccount(acc);
  return { ...acc, isActive: true };
}

export function migrateLegacyLogin(): AccountInfo | null {
  const loginData = readLoginJson();
  if (!loginData) return null;
  const existing = listAccounts();
  const token = (loginData['3PSIDMC'] as string) || '';
  if (token && existing.some((a) => a.token3PSIDMC === token)) return null;
  const name = (loginData.name as string) || 'Legacy Account';
  if (existing.some((a) => a.name === name)) return null;
  const acc = loginDataToAccount(loginData, name);
  writeAccountFile(acc);
  return acc;
}
