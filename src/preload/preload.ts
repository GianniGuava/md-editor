import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CloseDecision, FileData } from '../main/files';
import type {
  SessionData,
  SessionWindowData,
  WindowReport,
} from '../main/session';
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
  /** BrowserWindow id of this renderer's window; used to tag cross-window drags. */
  windowId: number;
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
  | 'tab:detach'
  | 'edit:find'
  | 'edit:replace'
  | 'edit:findNext'
  | 'edit:findPrev'
  | 'mode:editor'
  | 'mode:split'
  | 'mode:preview'
  | 'highlight'
  | 'scrollSync'
  | 'freezeHeaders'
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

/** A document travelling between windows (tear-off or cross-window drop). */
export interface DocSnapshot {
  id: string; // doc id in the source window
  path: string | null;
  name: string;
  text: string;
  savedText: string | null;
  diskHash: string | null;
  mtimeMs: number | null;
  dirty: boolean;
  draftId: string;
  eol?: '\n' | '\r\n';
  anchor: number;
  head: number;
  scrollTop: number;
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
      eol?: '\n' | '\r\n',
    ): Promise<{ hash: string; mtimeMs: number }> =>
      ipcRenderer.invoke('file:save', { path, text, eol }),
    saveAs: (
      suggestedName: string,
      text: string,
      eol?: '\n' | '\r\n',
    ): Promise<FileData | null> =>
      ipcRenderer.invoke('file:saveAsDialog', { suggestedName, text, eol }),
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
    /** This window's saved entry (null for a brand-new window) plus the global theme. */
    load: (): Promise<{
      theme: SessionData['theme'];
      window: SessionWindowData | null;
    }> => ipcRenderer.invoke('session:load'),
    save: (report: WindowReport): Promise<void> =>
      ipcRenderer.invoke('session:save', report),
    writeDraft: (id: string, text: string): Promise<void> =>
      ipcRenderer.invoke('draft:write', { id, text }),
    readDraft: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('draft:read', id),
    deleteDraft: (id: string): Promise<void> =>
      ipcRenderer.invoke('draft:delete', id),
  },

  windows: {
    /** Open an empty window near this one. */
    open: (): Promise<void> => ipcRenderer.invoke('window:new'),
    /**
     * Move a tab out of this window. Main either hands it to the window it was
     * dropped on (if a drop was reported) or opens a new window at `point`.
     * Resolves once the document has a home; the caller then removes its copy.
     */
    detachTab: (
      snapshot: DocSnapshot,
      point?: { x: number; y: number },
    ): Promise<void> => ipcRenderer.invoke('tab:detach', { snapshot, point }),
    /** This window accepted a tab dragged from another window. */
    tabDropped: (info: {
      sourceWindowId: number;
      docId: string;
    }): Promise<void> => ipcRenderer.invoke('tab:dropped', info),
    /** The renderer can accept documents now; returns any handed to this new window. */
    ready: (): Promise<DocSnapshot[]> => ipcRenderer.invoke('window:ready'),
  },
  /** A document of this window was accepted elsewhere; remove it without closing. */
  onRemoveMoved: (cb: (docId: string) => void) =>
    on<string>('tab:removeMoved', cb),

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

  /** Main asks before the window closes; the renderer answers closeNow() or closeCancelled(). */
  onRequestClose: (cb: () => void) => on<void>('app:requestClose', cb),
  closeNow: (): Promise<void> => ipcRenderer.invoke('app:closeNow'),
  closeCancelled: (): Promise<void> => ipcRenderer.invoke('app:closeCancelled'),

  /** Paths passed on the command line (e.g. "Open with"); only the first window gets them. */
  getStartupFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('app:getStartupFiles'),
};

export type MdApi = typeof api;

contextBridge.exposeInMainWorld('md', api);
