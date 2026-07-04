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
  return {
    name: name || (data.name as string) || 'Unknown',
    token3PSIDMC: (data['3PSIDMC'] as string) || '',
    trafficCode: (data.trafficCode as string) || '',
    expireTime: (data.expireTime as number) || 0,
    cookies: (data.cookies as Record<string, string>) || {},
    isActive: false,
  };
}

function accountToLoginData(acc: AccountInfo): Record<string, unknown> {
  return {
    '3PSIDMC': acc.token3PSIDMC,
    trafficCode: acc.trafficCode,
    expireTime: acc.expireTime,
    cookies: acc.cookies,
    name: acc.name,
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
