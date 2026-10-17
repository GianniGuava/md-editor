import { contextBridge, ipcRenderer } from 'electron';

/**
 * The typed bridge between the sandboxed renderer and the main process.
 * Only named functions are exposed; never ipcRenderer itself (PLAN.md step 1.2).
 * Keep `MdApi` in sync with src/renderer/global.d.ts.
 */
export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  systemTheme: 'light' | 'dark';
}

const api = {
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
};

export type MdApi = typeof api;

contextBridge.exposeInMainWorld('md', api);
