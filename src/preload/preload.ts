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

export interface ViewCommandMessage {
  name:
    | 'mode:editor'
    | 'mode:split'
    | 'mode:preview'
    | 'highlight'
    | 'scrollSync'
    | 'zoom:in'
    | 'zoom:out'
    | 'zoom:reset';
  checked?: boolean;
}

const api = {
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
  /** Menu commands from the main process. Returns an unsubscribe function. */
  onViewCommand: (cb: (msg: ViewCommandMessage) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: ViewCommandMessage) =>
      cb(msg);
    ipcRenderer.on('view:command', listener);
    return () => ipcRenderer.removeListener('view:command', listener);
  },
};

export type MdApi = typeof api;

contextBridge.exposeInMainWorld('md', api);
