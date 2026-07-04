import { contextBridge, ipcRenderer } from 'electron';
import type { AccountImportInput, AppStatus, BloxdApi, LogEntry, Settings } from '../shared/types';

const api: BloxdApi = {
  serviceStart: () => ipcRenderer.invoke('service:start'),
  serviceStop: () => ipcRenderer.invoke('service:stop'),
  serviceRestart: () => ipcRenderer.invoke('service:restart'),
  serviceGetStatus: () => ipcRenderer.invoke('service:get-status'),
  bloxdShow: () => ipcRenderer.invoke('bloxd:show'),
  bloxdHide: () => ipcRenderer.invoke('bloxd:hide'),
  bloxdReload: () => ipcRenderer.invoke('bloxd:reload'),
  bloxdGetStatus: () => ipcRenderer.invoke('bloxd:get-status'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsUpdate: (settings: Settings) => ipcRenderer.invoke('settings:update', settings),
  logsClear: () => ipcRenderer.invoke('logs:clear'),
  onLog: (callback: (entry: LogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry);
    ipcRenderer.on('logs:entry', listener);
    return () => ipcRenderer.off('logs:entry', listener);
  },
  onStatus: (callback: (status: AppStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AppStatus) => callback(status);
    ipcRenderer.on('status:update', listener);
    return () => ipcRenderer.off('status:update', listener);
  },
  accountsList: () => ipcRenderer.invoke('accounts:list'),
  accountsSwitch: (name: string) => ipcRenderer.invoke('accounts:switch', name),
  accountsDelete: (name: string) => ipcRenderer.invoke('accounts:delete', name),
  accountsImport: (input: AccountImportInput) => ipcRenderer.invoke('accounts:import', input),
  accountsValidate: (name?: string) => ipcRenderer.invoke('accounts:validate', name),
  accountsRefreshTokens: (name: string) => ipcRenderer.invoke('accounts:refresh-tokens', name),
  accountsCurrent: () => ipcRenderer.invoke('accounts:current'),
  matchmakeTest: (timeoutMs?: number) => ipcRenderer.invoke('matchmake:test', timeoutMs),
  matchmakeWaitCapture: (timeoutMs?: number) => ipcRenderer.invoke('matchmake:wait-capture', timeoutMs),
  matchmakeGetLast: () => ipcRenderer.invoke('matchmake:get-last'),
};

contextBridge.exposeInMainWorld('bloxdApi', api);
