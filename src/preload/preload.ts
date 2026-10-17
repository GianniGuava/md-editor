import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CloseDecision, FileData } from '../main/files';

/**
 * The typed bridge between the sandboxed renderer and the main process.
 * Only named functions are exposed; never ipcRenderer itself (PLAN.md step 1.2).
 * `MdApi` is the renderer's whole view of the outside world (src/renderer/global.d.ts).
 */
export type { CloseDecision, FileData };

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  systemTheme: 'light' | 'dark';
}

export type AppCommand =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:saveAs'
  | 'file:sample'
  | 'tab:close'
  | 'tab:reopen'
  | 'tab:next'
  | 'tab:prev'
  | 'mode:editor'
  | 'mode:split'
  | 'mode:preview'
  | 'highlight'
  | 'scrollSync'
  | 'zoom:in'
  | 'zoom:out'
  | 'zoom:reset';

export interface AppCommandMessage {
  name: AppCommand;
  checked?: boolean;
}

const on = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api = {
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
  /** Menu and accelerator commands from the main process. Returns an unsubscribe function. */
  onCommand: (cb: (msg: AppCommandMessage) => void) =>
    on<AppCommandMessage>('app:command', cb),

  files: {
    openDialog: (): Promise<FileData[]> =>
      ipcRenderer.invoke('file:openDialog'),
    read: (path: string): Promise<FileData> =>
      ipcRenderer.invoke('file:read', path),
    save: (
      path: string,
      text: string,
    ): Promise<{ hash: string; mtimeMs: number }> =>
      ipcRenderer.invoke('file:save', { path, text }),
    saveAs: (suggestedName: string, text: string): Promise<FileData | null> =>
      ipcRenderer.invoke('file:saveAsDialog', { suggestedName, text }),
    /** Files dropped on the window arrive as File objects; this yields their path. */
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
  },

  /** The one modal dialog (D-21). */
  confirmClose: (name: string): Promise<CloseDecision> =>
    ipcRenderer.invoke('dialog:confirmClose', { name }),

  /** Main asks before the window closes; the renderer answers with closeNow() or not at all. */
  onRequestClose: (cb: () => void) => on<void>('app:requestClose', cb),
  closeNow: (): Promise<void> => ipcRenderer.invoke('app:closeNow'),

  /** Paths passed on the command line (e.g. "Open with"). */
  getStartupFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('app:getStartupFiles'),
};

export type MdApi = typeof api;

contextBridge.exposeInMainWorld('md', api);
