import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  shell,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { buildMenu, type MenuState } from './menu';
import type { ThemePref } from '../preload/preload';
import { registerFileHandlers } from './files';
import { registerExportHandlers } from './export';
import { updateElectronApp } from 'update-electron-app';
import { startWatching, stopAllWatchers, stopWatching } from './watcher';
import {
  deleteDraft,
  loadSession,
  pruneDrafts,
  readDraft,
  saveSession,
  writeDraft,
  type SessionData,
  type SessionWindow,
} from './session';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Windows taskbar grouping and notifications use this id (ENGINEERING).
app.setAppUserModelId('com.guevarra.md');

// In development keep Chromium's profile inside the project (.dev-userdata/, gitignored)
// so a sandboxed dev shell never needs to write to %APPDATA% (ENGINEERING).
// Packaged builds use Electron's default %APPDATA%\MD location; session.json goes there in step 6.
if (process.env.MD_USER_DATA) {
  app.setPath('userData', process.env.MD_USER_DATA); // tests and isolated profiles
} else if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getAppPath(), '.dev-userdata'));
}

let mainWindow: BrowserWindow | null = null;
let closingConfirmed = false;
let lastSession: SessionData | null = null;
const userData = () => app.getPath('userData');

const windowState = (): SessionWindow | undefined => {
  if (!mainWindow) return undefined;
  const b = mainWindow.getNormalBounds();
  return { ...b, maximized: mainWindow.isMaximized() };
};
let boundsTimer: NodeJS.Timeout | undefined;
const scheduleBoundsSave = () => {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (lastSession)
      void saveSession(userData(), { ...lastSession, window: windowState() });
  }, 500);
};
const menuState: MenuState = { theme: 'light' };

/** Markdown-looking paths on the command line (double-click / "Open with"). */
const startupFiles = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .filter((a) => !a.startsWith('-'))
  .map((a) => path.resolve(a))
  .filter((p) => /\.(md|markdown|mdown|mkd|txt)$/i.test(p) && fs.existsSync(p));

/**
 * Security baseline (PLAN.md step 1.2, ENGINEERING; follows Electron's security
 * checklist, https://www.electronjs.org/docs/latest/tutorial/security):
 *  - contextIsolation on, nodeIntegration off, sandbox on: the renderer never
 *    touches Node or the filesystem; everything goes through the typed preload bridge.
 *  - navigation and window.open are refused; external links open in the OS browser.
 *  - the Content-Security-Policy lives in index.html.
 */
const createWindow = (): BrowserWindow => {
  // Restore window bounds only if they still fall on a connected display (D-22).
  const saved = loadSession(userData());
  lastSession = saved;
  let bounds: Partial<SessionWindow> = {};
  if (saved?.window) {
    const { x, y, width, height } = saved.window;
    const a = screen.getDisplayMatching({ x, y, width, height }).workArea;
    if (
      x < a.x + a.width &&
      x + width > a.x &&
      y < a.y + a.height &&
      y + height > a.y
    ) {
      bounds = { x, y, width, height };
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
  mainWindow = win;

  win.once('ready-to-show', () => {
    if (saved?.window?.maximized) win.maximize();
    win.show();
  });
  win.on('resize', scheduleBoundsSave);
  win.on('move', scheduleBoundsSave);
  win.on('closed', () => {
    mainWindow = null;
    void stopAllWatchers();
  });

  // Closing with unsaved work: the renderer runs the Save / Don't save / Cancel flow
  // (D-21) and calls closeNow() if the user did not cancel.
  win.on('close', (event) => {
    if (!closingConfirmed) {
      event.preventDefault();
      win.webContents.send('app:requestClose');
    }
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
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  buildMenu(win, menuState);
  return win;
};

// ---- IPC: the only surface the renderer can reach ----
ipcMain.handle('app:getInfo', () => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  systemTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
}));
ipcMain.handle('app:getStartupFiles', () => startupFiles);
ipcMain.handle('theme:set', (_e, pref: ThemePref) => {
  menuState.theme = pref;
  // Native dialogs, scrollbars and the window background follow the chosen theme;
  // "hc" is a light theme for the OS's purposes.
  nativeTheme.themeSource =
    pref === 'system' ? 'system' : pref === 'dark' ? 'dark' : 'light';
  if (mainWindow) buildMenu(mainWindow, menuState);
  return { dark: nativeTheme.shouldUseDarkColors };
});
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:system', {
    dark: nativeTheme.shouldUseDarkColors,
  });
});
ipcMain.handle('app:closeNow', () => {
  closingConfirmed = true;
  mainWindow?.close();
});
registerFileHandlers(() => mainWindow);
registerExportHandlers(() => mainWindow);
ipcMain.handle('session:load', () => {
  const data = loadSession(userData());
  void pruneDrafts(
    userData(),
    new Set((data?.tabs ?? []).flatMap((t) => (t.draft ? [t.draft] : []))),
  );
  return data;
});
ipcMain.handle('session:save', async (_e, data: SessionData) => {
  lastSession = { ...data, window: windowState() ?? lastSession?.window };
  await saveSession(userData(), lastSession);
});
ipcMain.handle('draft:write', (_e, a: { id: string; text: string }) =>
  writeDraft(userData(), a.id, a.text),
);
ipcMain.handle('draft:read', (_e, id: string) => readDraft(userData(), id));
ipcMain.handle('draft:delete', (_e, id: string) => deleteDraft(userData(), id));
ipcMain.handle('watch:start', (_e, p: string) =>
  startWatching(p, () => mainWindow),
);
ipcMain.handle('watch:stop', (_e, p: string) => stopWatching(p));

// Auto-update (PLAN.md step 10 / distribution): installed Squirrel builds poll
// update.electronjs.org for newer GitHub releases of the public repo. Inert in
// development and in portable (non-Squirrel) copies; failures are logged, never shown.
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('child-process-gone', (_e, details) =>
  console.error(
    `[md] child-process-gone ${details.type} ${details.reason} exit=${details.exitCode}`,
  ),
);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
