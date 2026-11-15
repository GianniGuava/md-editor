/**
 * Install the desktop copy of MD (docs/fixes/2026-11-14-blank-window.md).
 *
 * The Desktop shortcut used to run the repo itself
 * (node_modules\electron\dist\electron.exe <repo> --appdata), so `npm start`, which
 * replaces .vite/ with a development build that loads http://localhost:5173, left the
 * shortcut showing a blank window. This script copies a checked production build and
 * its own copy of the signed Electron runtime to a folder outside the repo, then points
 * the Desktop shortcut MD.lnk there. Nothing done in the repo afterwards affects it.
 *
 * Run: npm run install:desktop   (builds with `electron-forge package` first)
 * Options: --no-shortcut leaves MD.lnk alone.
 * Environment: MD_DESKTOP_DIR overrides the install folder (default %LOCALAPPDATA%\MD-desktop).
 *
 * Layout of the install folder:
 *   app\       package.json, .vite\build, .vite\renderer, assets\app.ico
 *   runtime\   copy of node_modules\electron\dist (copied only when the version changes)
 *   .md-desktop  marker: the script only ever replaces a folder that carries it
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = '.vite/build/main.cjs';
const PRELOAD = '.vite/build/preload.cjs';
const RENDERER_PAGE = '.vite/renderer/main_window/index.html';
const ICON = 'assets/app.ico';
const MARKER = '.md-desktop';

/**
 * Problems that make `appDir` unfit to run as the desktop app; empty when it is fine.
 * @param {string} appDir folder holding package.json and .vite/
 * @returns {string[]}
 */
export const checkBundle = (appDir) => {
  const problems = [];
  const at = (rel) => path.join(appDir, rel);

  let main;
  try {
    main = JSON.parse(fs.readFileSync(at('package.json'), 'utf8')).main;
  } catch {
    problems.push(`package.json is missing or unreadable in ${appDir}.`);
  }
  if (main !== undefined && path.posix.normalize(String(main)) !== MAIN) {
    problems.push(`package.json names "${main}" as the app entry; expected "${MAIN}".`);
  }

  if (!fs.existsSync(at(MAIN))) {
    problems.push(`${MAIN} is missing: the main process was not built.`);
  } else {
    const devUrl = fs.readFileSync(at(MAIN), 'utf8').match(/https?:\/\/localhost:\d+/);
    if (devUrl) {
      problems.push(
        `${MAIN} is a development build: its window loads ${devUrl[0]}, a dev server ` +
          'that only runs during `npm start`. Stop `npm start` if it is running and try again.',
      );
    }
  }
  if (!fs.existsSync(at(PRELOAD))) problems.push(`${PRELOAD} is missing.`);
  if (!fs.existsSync(at(RENDERER_PAGE))) {
    problems.push(`${RENDERER_PAGE} is missing: the window would have no page to show.`);
  }
  if (!fs.existsSync(at(ICON))) problems.push(`${ICON} is missing (the window icon).`);
  return problems;
};

const readVersion = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, 'version'), 'utf8').trim();
  } catch {
    return undefined;
  }
};

/**
 * Whether the Electron runtime in `srcDist` has to be copied over `destRuntime`.
 * @param {string} srcDist node_modules/electron/dist
 * @param {string} destRuntime the installed runtime folder
 */
export const runtimeNeedsCopy = (srcDist, destRuntime) => {
  const want = readVersion(srcDist);
  return (
    want === undefined ||
    readVersion(destRuntime) !== want ||
    !fs.existsSync(path.join(destRuntime, 'electron.exe'))
  );
};

/** Windows path equality: case, slash direction and a trailing slash do not matter. */
export const samePath = (a, b) => {
  const norm = (p) =>
    path.win32
      .normalize(p)
      .replace(/[\\]+$/, '')
      .toLowerCase();
  return norm(a) === norm(b);
};

/**
 * What to do with MD.lnk given its current target (null when there is no shortcut).
 * Only a shortcut this project made (pointing at the repo's runtime or the install
 * folder's runtime) is changed; anything else is the user's and is left alone.
 * @param {string | null} currentTarget
 * @param {{ repoElectron: string, installElectron: string }} known
 * @returns {'create' | 'update' | 'leave'}
 */
export const shortcutDecision = (currentTarget, known) => {
  if (!currentTarget) return 'create';
  if (samePath(currentTarget, known.repoElectron)) return 'update';
  if (samePath(currentTarget, known.installElectron)) return 'update';
  return 'leave';
};

/* ---------------- Running the install ---------------- */

class Stop extends Error {}

const powershell = (script, env = {}) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  }).trim();

/** Refuse to touch a folder this script did not make. */
const assertOurs = (dir) => {
  if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, MARKER))) {
    throw new Stop(
      `${dir} exists but was not made by this script (no ${MARKER} marker), so it is left ` +
        'alone. Move it, or set MD_DESKTOP_DIR to another folder, and run again.',
    );
  }
};

const install = ({ repoDir, installDir, shortcut }) => {
  const log = (line) => console.log(`[install:desktop] ${line}`);
  const srcDist = path.join(repoDir, 'node_modules', 'electron', 'dist');
  const stage = `${installDir}.new`;
  const old = `${installDir}.old`;

  const problems = checkBundle(repoDir);
  if (problems.length) {
    throw new Stop(`The build in ${repoDir} cannot be installed:\n  - ${problems.join('\n  - ')}`);
  }
  if (!fs.existsSync(path.join(srcDist, 'electron.exe'))) {
    throw new Stop(
      `${path.join(srcDist, 'electron.exe')} is missing. npm 11 skips install scripts not ` +
        'listed in allowScripts, which can leave Electron without its runtime. Run ' +
        '`node node_modules/electron/install.js`, then run this again.',
    );
  }
  for (const dir of [installDir, stage, old]) assertOurs(dir);

  // Leftovers from an interrupted run are ours (they carry the marker).
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(old, { recursive: true, force: true });

  // Moving the current copy aside fails while MD runs from it: stop before changing anything.
  const hadInstall = fs.existsSync(installDir);
  if (hadInstall) {
    try {
      fs.renameSync(installDir, old);
    } catch (err) {
      if (['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        throw new Stop(
          `Windows would not move ${installDir} (${err.code}), which usually means MD is ` +
            'open. Close every MD window and run this again. The installed copy is unchanged.',
        );
      }
      throw err;
    }
  }

  let reusedRuntime = false;
  try {
    const appDir = path.join(stage, 'app');
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(repoDir, 'package.json'), path.join(appDir, 'package.json'));
    fs.copyFileSync(path.join(repoDir, ICON), path.join(appDir, ICON));
    for (const sub of ['.vite/build', '.vite/renderer']) {
      fs.cpSync(path.join(repoDir, sub), path.join(appDir, sub), { recursive: true });
    }

    const oldRuntime = path.join(old, 'runtime');
    if (hadInstall && !runtimeNeedsCopy(srcDist, oldRuntime)) {
      fs.renameSync(oldRuntime, path.join(stage, 'runtime'));
      reusedRuntime = true;
    } else {
      fs.cpSync(srcDist, path.join(stage, 'runtime'), { recursive: true });
    }
    fs.writeFileSync(
      path.join(stage, MARKER),
      `MD desktop copy, installed ${new Date().toISOString()} from ${repoDir}\n`,
    );

    const staged = checkBundle(appDir);
    if (!fs.existsSync(path.join(stage, 'runtime', 'electron.exe'))) {
      staged.push('runtime/electron.exe is missing from the copy.');
    }
    if (staged.length) throw new Stop(`The copied build failed its check:\n  - ${staged.join('\n  - ')}`);

    fs.renameSync(stage, installDir);
  } catch (err) {
    // Put the previous copy back exactly as it was.
    if (reusedRuntime && fs.existsSync(path.join(stage, 'runtime'))) {
      fs.renameSync(path.join(stage, 'runtime'), path.join(old, 'runtime'));
    }
    fs.rmSync(stage, { recursive: true, force: true });
    if (hadInstall && !fs.existsSync(installDir) && fs.existsSync(old)) {
      fs.renameSync(old, installDir);
    }
    throw err;
  }

  try {
    fs.rmSync(old, { recursive: true, force: true });
  } catch (err) {
    log(`Could not remove the previous copy ${old} (${err.code}); it is removed on the next install.`);
  }

  const version = readVersion(path.join(installDir, 'runtime'));
  log(`Installed to ${installDir}`);
  log(`Electron ${version}, runtime ${reusedRuntime ? 'kept (same version)' : 'copied'}.`);

  if (!shortcut) {
    log('Shortcut left alone (--no-shortcut).');
    return;
  }
  const installElectron = path.join(installDir, 'runtime', 'electron.exe');
  const appDir = path.join(installDir, 'app');
  const desktop = powershell("[Environment]::GetFolderPath('Desktop')");
  const lnk = path.join(desktop, 'MD.lnk');
  const current = fs.existsSync(lnk)
    ? powershell('(New-Object -ComObject WScript.Shell).CreateShortcut($env:MD_LNK).TargetPath', {
        MD_LNK: lnk,
      }) || null
    : null;
  const decision = shortcutDecision(current, {
    repoElectron: path.join(srcDist, 'electron.exe'),
    installElectron,
  });
  if (decision === 'leave') {
    log(`${lnk} points at ${current}, not at MD, so it was left unchanged.`);
    log(`To use the installed copy, point a shortcut at ${installElectron} with arguments "${appDir}" --appdata`);
    return;
  }
  powershell(
    [
      '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:MD_LNK)',
      '$s.TargetPath = $env:MD_TARGET',
      '$s.Arguments = $env:MD_ARGS',
      '$s.WorkingDirectory = $env:MD_WD',
      '$s.IconLocation = $env:MD_ICON',
      "$s.Description = 'MD Markdown editor'",
      '$s.Save()',
    ].join('; '),
    {
      MD_LNK: lnk,
      MD_TARGET: installElectron,
      MD_ARGS: `"${appDir}" --appdata`,
      MD_WD: appDir,
      MD_ICON: `${path.join(appDir, ICON)},0`,
    },
  );
  log(`${decision === 'create' ? 'Created' : 'Updated'} ${lnk}.`);
  log('Your session and drafts stay in %APPDATA%\\MD, as before.');
};

const runDirectly =
  process.argv[1] !== undefined && samePath(fileURLToPath(import.meta.url), path.resolve(process.argv[1]));

if (runDirectly) {
  if (process.platform !== 'win32') {
    console.error('[install:desktop] This installs the Windows desktop copy; it only runs on Windows.');
    process.exit(1);
  }
  const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const base = process.env.MD_DESKTOP_DIR || process.env.LOCALAPPDATA;
  if (!base) {
    console.error('[install:desktop] Neither MD_DESKTOP_DIR nor LOCALAPPDATA is set; nothing was changed.');
    process.exit(1);
  }
  const installDir = path.resolve(
    process.env.MD_DESKTOP_DIR || path.join(base, 'MD-desktop'),
  );
  try {
    install({ repoDir, installDir, shortcut: !process.argv.includes('--no-shortcut') });
  } catch (err) {
    console.error(`[install:desktop] ${err instanceof Stop ? err.message : err.stack}`);
    process.exit(1);
  }
}
