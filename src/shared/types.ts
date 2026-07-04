export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
export type BloxdPageStatus = 'not-loaded' | 'loading' | 'ready' | 'needs-interaction' | 'template-captured' | 'released' | 'error';
export type ProxyProvider = 'electron-cdp' | 'tampermonkey-ws' | 'none';

export interface ServiceState {
  status: ServiceStatus;
  connected: boolean;
  playerName?: string;
  currentGame?: string;
  currentLobby?: string;
  version: number;
  address: string;
  minecraftVersion: string;
}

export interface BloxdStatus {
  status: BloxdPageStatus;
  visible: boolean;
  provider: ProxyProvider;
  url?: string;
  templateCaptured: boolean;
  released?: boolean;
  inGameDetected?: boolean;
  lastError?: string;
}

export interface AppStatus {
  service: ServiceState;
  bloxd: BloxdStatus;
}

export interface LogEntry {
  id: number;
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface AccountInfo {
  name: string;
  token3PSIDMC: string;
  trafficCode: string;
  expireTime: number;
  cookies: Record<string, string>;
  isActive: boolean;
}

export type Settings = Record<string, unknown>;

export interface BloxdApi {
  serviceStart(): Promise<ServiceState>;
  serviceStop(): Promise<ServiceState>;
  serviceRestart(): Promise<ServiceState>;
  serviceGetStatus(): Promise<AppStatus>;
  bloxdShow(): Promise<BloxdStatus>;
  bloxdHide(): Promise<BloxdStatus>;
  bloxdReload(): Promise<BloxdStatus>;
  bloxdGetStatus(): Promise<BloxdStatus>;
  settingsGet(): Promise<Settings>;
  settingsUpdate(settings: Settings): Promise<Settings>;
  logsClear(): Promise<void>;
  onLog(callback: (entry: LogEntry) => void): () => void;
  onStatus(callback: (status: AppStatus) => void): () => void;
  accountsList(): Promise<AccountInfo[]>;
  accountsSwitch(name: string): Promise<AccountInfo>;
  accountsDelete(name: string): Promise<void>;
  accountsLogin(): Promise<AccountInfo | null>;
  accountsRefreshTokens(name: string): Promise<AccountInfo>;
  accountsCurrent(): Promise<AccountInfo | null>;
}
