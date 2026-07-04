export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
export type BloxdPageStatus = 'not-loaded' | 'loading' | 'ready' | 'needs-interaction' | 'waiting-login' | 'waiting-world' | 'input-missing' | 'released' | 'error';
export type ProxyProvider = 'electron-page-client' | 'electron-cdp-once' | 'electron-cdp' | 'tampermonkey-ws' | 'none';

export interface ServiceState {
  status: ServiceStatus;
  connected: boolean;
  playerName?: string;
  currentGame?: string;
  currentLobby?: string;
  runtimeMode?: 'page-client' | 'node-colyseus';
  version: number;
  address: string;
  minecraftVersion: string;
}

export interface BloxdStatus {
  status: BloxdPageStatus;
  visible: boolean;
  provider: ProxyProvider;
  url?: string;
  released?: boolean;
  inGameDetected?: boolean;
  pageClientState?: BloxdPageBridgeState;
  lastMatchmake?: MatchmakeCapture;
  lastError?: string;
}

export interface BloxdPageBridgeState {
  gameSocketConnected?: boolean;
  worldReady?: boolean;
  inputReady?: boolean;
  localEntityId?: string | number;
  chunkCount?: number;
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
  token3PSIDMCPP?: string;
  token3PSIDMCSP?: string;
  trafficCode: string;
  expireTime: number;
  cookies: Record<string, string>;
  socialId?: number;
  socialHost?: string;
  whamm?: string;
  languages?: string[];
  isActive: boolean;
}

export interface AccountImportInput {
  name?: string;
  raw: string;
}

export interface MatchmakeTestResult {
  ok: boolean;
  status: number;
  statusText?: string;
  body: string;
}

export interface MatchmakeCapture {
  gameServerHost: string;
  lobbyName?: string;
  gameNameWithVariation?: string;
  matchmakeUrl?: string;
  capturedAt: number;
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
  accountsImport(input: AccountImportInput): Promise<AccountInfo>;
  accountsValidate(name?: string): Promise<AccountInfo>;
  accountsRefreshTokens(name: string): Promise<AccountInfo>;
  accountsCurrent(): Promise<AccountInfo | null>;
  matchmakeTest(timeoutMs?: number): Promise<MatchmakeTestResult>;
  matchmakeWaitCapture(timeoutMs?: number): Promise<MatchmakeCapture | null>;
  matchmakeGetLast(): Promise<MatchmakeCapture | null>;
}
