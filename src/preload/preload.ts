import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CloseDecision, FileData } from '../main/files';
import type { SessionData } from '../main/session';
import type { ExportCapabilities, PandocFormat } from '../main/export';

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
  | 'zoom:reset'
  | 'theme:set'
  | 'theme:cycle'
  | 'export:open'
  | 'help:about';

export type ThemePref = 'light' | 'dark' | 'hc' | 'system';

export interface ExportResult {
  ok: boolean;
  path?: string;
  error?: string;
  cancelled?: boolean;
}

export interface AppCommandMessage {
  name: AppCommand;
  checked?: boolean;
  value?: string;
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

  watch: {
    start: (path: string): Promise<void> =>
      ipcRenderer.invoke('watch:start', path),
    stop: (path: string): Promise<void> =>
      ipcRenderer.invoke('watch:stop', path),
  },
  onFileChanged: (cb: (data: FileData) => void) =>
    on<FileData>('file:changed', cb),
  onFileRemoved: (cb: (info: { path: string }) => void) =>
    on<{ path: string }>('file:removed', cb),
  onWatchError: (cb: (info: { path: string; message: string }) => void) =>
    on<{ path: string; message: string }>('file:watchError', cb),

  theme: {
    /** Reports the preference; main updates the menu and native dialogs and returns the OS value. */
    set: (pref: ThemePref): Promise<{ dark: boolean }> =>
      ipcRenderer.invoke('theme:set', pref),
  },
  onSystemTheme: (cb: (info: { dark: boolean }) => void) =>
    on<{ dark: boolean }>('theme:system', cb),

  session: {
    load: (): Promise<SessionData | null> => ipcRenderer.invoke('session:load'),
    save: (data: SessionData): Promise<void> =>
      ipcRenderer.invoke('session:save', data),
    writeDraft: (id: string, text: string): Promise<void> =>
      ipcRenderer.invoke('draft:write', { id, text }),
    readDraft: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('draft:read', id),
    deleteDraft: (id: string): Promise<void> =>
      ipcRenderer.invoke('draft:delete', id),
  },

  export: {
    capabilities: (): Promise<ExportCapabilities> =>
      ipcRenderer.invoke('export:capabilities'),
    html: (a: { html: string; docPath: string | null; name: string }) =>
      ipcRenderer.invoke('export:html', a) as Promise<ExportResult>,
    pdf: (a: {
      html: string;
      docPath: string | null;
      name: string;
      pageSize: 'A4' | 'Letter';
    }) => ipcRenderer.invoke('export:pdf', a) as Promise<ExportResult>,
    pandoc: (a: {
      markdown: string;
      format: PandocFormat;
      docPath: string | null;
      name: string;
      title: string;
      pdfEngine?: string;
    }) => ipcRenderer.invoke('export:pandoc', a) as Promise<ExportResult>,
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
