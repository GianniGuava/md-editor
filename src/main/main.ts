import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { updateElectronApp } from 'update-electron-app';
import { buildMenu, type MenuState } from './menu';
import { registerFileHandlers } from './files';
import { registerExportHandlers } from './export';
import {
  releaseWindow,
  startWatching,
  stopAllWatchers,
  stopWatching,
} from './watcher';
import {
  backupSession,
  deleteDraft,
  draftIdsIn,
  emptySession,
  loadSession,
  pruneDrafts,
  readDraft,
  saveSession,
  writeDraft,
  type SessionData,
  type SessionWindow,
  type SessionWindowData,
  type WindowReport,
} from './session';
import type { DocSnapshot, ThemePref } from '../preload/preload';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Windows taskbar grouping and notifications use this id (ENGINEERING).
app.setAppUserModelId('com.guevarra.md');

// In development keep Chromium's profile inside the project (.dev-userdata/, gitignored)
// so a sandboxed dev shell never needs to write to %APPDATA% (ENGINEERING).
// Packaged builds use Electron's default %APPDATA%\MD location.
// `--appdata` keeps the standard profile when the production bundle is run through the
// signed Electron runtime (node_modules\electron\dist\electron.exe <project> --appdata),
// the way the desktop shortcut works while Smart App Control blocks the unsigned md.exe.
const useAppData = process.argv.includes('--appdata');
if (process.env.MD_USER_DATA) {
  app.setPath('userData', process.env.MD_USER_DATA); // tests and isolated profiles
} else if (!app.isPackaged && !useAppData) {
  app.setPath('userData', path.join(app.getAppPath(), '.dev-userdata'));
}

const userData = () => app.getPath('userData');

/* ---------------- Windows ---------------- */

interface WindowEntry {
  win: BrowserWindow;
  sessionId: string;
  closingConfirmed: boolean;
  ready: boolean;
  pendingDocs: DocSnapshot[];
  startupFiles: string[];
}

const windows = new Map<number, WindowEntry>();
let quitting = false;

/** Markdown-looking paths on the command line (double-click / "Open with"). */
let startupFiles = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .filter((a) => !a.startsWith('-'))
  .map((a) => path.resolve(a))
  .filter((p) => /\.(md|markdown|mdown|mkd|txt)$/i.test(p) && fs.existsSync(p));

/* ---------------- Session (one entry per window) ---------------- */

backupSession(userData());
let session: SessionData = loadSession(userData()) ?? emptySession();
const menuState: MenuState = { theme: session.theme };
let writeTimer: NodeJS.Timeout | undefined;

const entryFor = (e: IpcMainInvokeEvent): WindowEntry | undefined => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return win ? windows.get(win.id) : undefined;
};

const boundsOf = (win: BrowserWindow): SessionWindow => ({
  ...win.getNormalBounds(),
  maximized: win.isMaximized(),
});

const writeSession = () => {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    session.savedAt = new Date().toISOString();
    void saveSession(userData(), session);
  }, 300);
};

const upsertWindowData = (
  sessionId: string,
  data: Partial<SessionWindowData>,
) => {
  const i = session.windows.findIndex((w) => w.id === sessionId);
  const base: SessionWindowData =
    i >= 0
      ? session.windows[i]
      : {
          id: sessionId,
          paneMode: 'split',
          split: 50,
          fontSize: 18,
          highlight: true,
          scrollSync: true,
          tabs: [],
          activeIndex: 0,
          closed: [],
        };
  const merged = { ...base, ...data, id: sessionId };
  if (i >= 0) session.windows[i] = merged;
  else session.windows.push(merged);
};

/* ---------------- Window creation ---------------- */

const onDisplay = (b: SessionWindow): boolean => {
  const a = screen.getDisplayMatching(b).workArea;
  return (
    b.x < a.x + a.width &&
    b.x + b.width > a.x &&
    b.y < a.y + a.height &&
    b.y + b.height > a.y
  );
};

interface CreateOptions {
  sessionId?: string;
  saved?: SessionWindow;
  at?: { x: number; y: number };
  pendingDocs?: DocSnapshot[];
  startupFiles?: string[];
}

/**
 * Security baseline (PLAN.md step 1.2, ENGINEERING; follows Electron's security
 * checklist, https://www.electronjs.org/docs/latest/tutorial/security):
 *  - contextIsolation on, nodeIntegration off, sandbox on: the renderer never
 *    touches Node or the filesystem; everything goes through the typed preload bridge.
 *  - navigation and window.open are refused; external links open in the OS browser.
 *  - the Content-Security-Policy lives in index.html.
 */
const createWindow = (opts: CreateOptions = {}): BrowserWindow => {
  const sessionId = opts.sessionId ?? randomUUID();
  let bounds: Partial<SessionWindow> = {};
  if (opts.saved && onDisplay(opts.saved)) bounds = opts.saved;
  else if (opts.at) bounds = { x: opts.at.x, y: opts.at.y };
  else {
    // Cascade from the focused window (ENGINEERING: a new window must not hide the old one).
    const focused = BrowserWindow.getFocusedWindow();
    if (focused) {
      const b = focused.getNormalBounds();
      bounds = { x: b.x + 40, y: b.y + 40, width: b.width, height: b.height };
    }
  }

  const win = new BrowserWindow({
    width: bounds.width ?? 1200,
    height: bounds.height ?? 800,
    x: bounds.x,
    y: bounds.y,
    minWidth: 640,
    minHeight: 400,
    title: 'MD',
    // Packaged builds carry the icon in the executable; the runtime launch needs it here.
    icon: app.isPackaged
      ? undefined
      : path.join(app.getAppPath(), 'assets', 'app.ico'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#FFFFFF', // tokens.css bg
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const entry: WindowEntry = {
    win,
    sessionId,
    closingConfirmed: false,
    ready: false,
    pendingDocs: opts.pendingDocs ?? [],
    startupFiles: opts.startupFiles ?? [],
  };
  windows.set(win.id, entry);
  upsertWindowData(sessionId, { window: boundsOf(win) });

  win.once('ready-to-show', () => {
    if (opts.saved?.maximized) win.maximize();
    win.show();
  });

  let boundsTimer: NodeJS.Timeout | undefined;
  const onBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!win.isDestroyed()) {
        upsertWindowData(sessionId, { window: boundsOf(win) });
        writeSession();
      }
    }, 500);
  };
  win.on('resize', onBounds);
  win.on('move', onBounds);

  // Closing with unsaved work: the renderer runs the Save / Don't save / Cancel flow
  // (D-21) and calls closeNow() if the user did not cancel.
  win.on('close', (event) => {
    if (!entry.closingConfirmed) {
      event.preventDefault();
      win.webContents.send('app:requestClose');
    }
  });
  win.on('closed', () => {
    windows.delete(win.id);
    void releaseWindow(win.id);
    if (!quitting && windows.size > 0) {
      // A window closed while others stay open is not reopened next launch; closing the
      // last window, or quitting, keeps every entry so the next launch restores them.
      session.windows = session.windows.filter((w) => w.id !== sessionId);
      writeSession();
    }
    if (windows.size === 0) void stopAllWatchers();
  });

  // Failures that would otherwise be silent in a GUI process.
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error(`[md] did-fail-load ${code} ${desc} ${url}`),
  );
  win.webContents.on('render-process-gone', (_e, details) =>
    console.error(
      `[md] render-process-gone ${details.reason} exit=${details.exitCode}`,
    ),
  );

  // Refuse in-app navigation; open http(s) links in the system browser.
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.startsWith('https:') || url.startsWith('http:'))
      void shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:'))
      void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return win;
};

const rebuildMenu = () =>
  buildMenu(menuState, { newWindow: () => createWindow() });

/* ---------------- Tab transfer between windows ---------------- */

// Drops reported by a receiving window, keyed by `${sourceWindowId}:${docId}`.
const recentDrops = new Map<string, number>();
const DROP_GRACE_MS = 400;

const dropSeen = (key: string) => {
  const t = recentDrops.get(key);
  return t !== undefined && Date.now() - t < DROP_GRACE_MS * 2;
};

/* ---------------- IPC: the only surface the renderer can reach ---------------- */

ipcMain.handle('app:getInfo', (e) => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  systemTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
  windowId: BrowserWindow.fromWebContents(e.sender)?.id ?? -1,
}));
ipcMain.handle(
  'app:getStartupFiles',
  (e) => entryFor(e)?.startupFiles.splice(0) ?? [],
);
ipcMain.handle('app:closeNow', (e) => {
  const entry = entryFor(e);
  if (!entry) return;
  entry.closingConfirmed = true;
  entry.win.close();
});
ipcMain.handle('app:closeCancelled', () => {
  quitting = false; // an aborted Exit must not make later single-window closes look like a quit
});

ipcMain.handle('theme:set', (_e, pref: ThemePref) => {
  menuState.theme = pref;
  session.theme = pref;
  // Native dialogs, scrollbars and the window background follow the chosen theme;
  // "hc" is a light theme for the OS's purposes.
  nativeTheme.themeSource =
    pref === 'system' ? 'system' : pref === 'dark' ? 'dark' : 'light';
  rebuildMenu();
  writeSession();
  return { dark: nativeTheme.shouldUseDarkColors };
});
nativeTheme.on('updated', () => {
  for (const { win } of windows.values()) {
    win.webContents.send('theme:system', {
      dark: nativeTheme.shouldUseDarkColors,
    });
  }
});

ipcMain.handle('session:load', (e) => {
  const entry = entryFor(e);
  const data = entry
    ? (session.windows.find((w) => w.id === entry.sessionId) ?? null)
    : null;
  return {
    theme: session.theme,
    window: data && data.tabs.length > 0 ? data : null,
  };
});
ipcMain.handle('session:save', async (e, report: WindowReport) => {
  const entry = entryFor(e);
  if (!entry) return;
  const { theme, ...rest } = report;
  session.theme = theme;
  upsertWindowData(entry.sessionId, { ...rest, window: boundsOf(entry.win) });
  // Written at once (not debounced): this may be the last call before the process exits.
  clearTimeout(writeTimer);
  session.savedAt = new Date().toISOString();
  await saveSession(userData(), session);
});
ipcMain.handle('draft:write', (_e, a: { id: string; text: string }) =>
  writeDraft(userData(), a.id, a.text),
);
ipcMain.handle('draft:read', (_e, id: string) => readDraft(userData(), id));
ipcMain.handle('draft:delete', (_e, id: string) => deleteDraft(userData(), id));

ipcMain.handle('watch:start', (e, p: string) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) startWatching(p, win.id);
});
ipcMain.handle('watch:stop', (e, p: string) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) return stopWatching(p, win.id);
});

ipcMain.handle('window:new', () => {
  createWindow();
});
ipcMain.handle('window:ready', (e): DocSnapshot[] => {
  const entry = entryFor(e);
  if (!entry) return [];
  entry.ready = true;
  return entry.pendingDocs.splice(0);
});
ipcMain.handle(
  'tab:detach',
  async (e, a: { snapshot: DocSnapshot; point?: { x: number; y: number } }) => {
    const source = BrowserWindow.fromWebContents(e.sender);
    const key = `${source?.id}:${a.snapshot.id}`;
    // Another window may have reported the drop already, or may do so in a moment.
    if (!dropSeen(key)) await new Promise((r) => setTimeout(r, DROP_GRACE_MS));
    if (dropSeen(key)) {
      recentDrops.delete(key);
      return; // the receiving window owns it now
    }
    const at = a.point ?? screen.getCursorScreenPoint();
    createWindow({
      at: { x: at.x - 80, y: at.y - 20 },
      pendingDocs: [a.snapshot],
    });
  },
);
ipcMain.handle(
  'tab:dropped',
  (_e, info: { sourceWindowId: number; docId: string }) => {
    recentDrops.set(`${info.sourceWindowId}:${info.docId}`, Date.now());
    const source = windows.get(info.sourceWindowId);
    source?.win.webContents.send('tab:removeMoved', info.docId);
  },
);

// Dialogs attach to the window the user is interacting with.
registerFileHandlers(() => BrowserWindow.getFocusedWindow());
registerExportHandlers(() => BrowserWindow.getFocusedWindow());

/* ---------------- Auto-update ---------------- */

// Squirrel installs put Update.exe one level above the versioned app folder; portable
// copies (out/MD-win32-x64) have none and would only log "Can not find Squirrel".
const installedBySquirrel = fs.existsSync(
  path.join(path.dirname(process.execPath), '..', 'Update.exe'),
);
if (app.isPackaged && installedBySquirrel) {
  try {
    updateElectronApp({
      repo: 'GianniGuava/md-editor',
      updateInterval: '1 hour',
      notifyUser: true,
      logger: console,
    });
  } catch (err) {
    console.error('[md] updater not started', err);
  }
}

/* ---------------- Lifecycle ---------------- */

app.on('before-quit', () => {
  quitting = true;
});

app.whenReady().then(() => {
  nativeTheme.themeSource =
    session.theme === 'system'
      ? 'system'
      : session.theme === 'dark'
        ? 'dark'
        : 'light';
  rebuildMenu();
  void pruneDrafts(userData(), draftIdsIn(session));

  const saved = session.windows.filter((w) => w.tabs.length > 0);
  session.windows = saved;
  if (saved.length === 0) {
    createWindow({ startupFiles });
  } else {
    saved.forEach((w, i) =>
      createWindow({
        sessionId: w.id,
        saved: w.window,
        startupFiles: i === 0 ? startupFiles : [],
      }),
    );
  }
  startupFiles = [];

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('child-process-gone', (_e, details) =>
  console.error(
    `[md] child-process-gone ${details.type} ${details.reason} exit=${details.exitCode}`,
  ),
);

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  clearTimeout(writeTimer);
  session.savedAt = new Date().toISOString();
  void saveSession(userData(), session).finally(() => app.quit());
});
