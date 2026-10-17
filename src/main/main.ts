import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { buildMenu } from './menu';
import { registerFileHandlers } from './files';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Windows taskbar grouping and notifications use this id (ENGINEERING).
app.setAppUserModelId('com.guevarra.md');

// In development keep Chromium's profile inside the project (.dev-userdata/, gitignored)
// so a sandboxed dev shell never needs to write to %APPDATA% (ENGINEERING).
// Packaged builds use Electron's default %APPDATA%\MD location; session.json goes there in step 6.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getAppPath(), '.dev-userdata'));
}

let mainWindow: BrowserWindow | null = null;
let closingConfirmed = false;

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
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
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

  buildMenu(win);
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
ipcMain.handle('app:closeNow', () => {
  closingConfirmed = true;
  mainWindow?.close();
});
registerFileHandlers(() => mainWindow);

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
