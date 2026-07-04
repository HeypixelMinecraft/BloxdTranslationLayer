import type { BloxdApi } from '../shared/types';

declare global {
  interface Window {
    bloxdApi: BloxdApi;
  }
}

export {};
