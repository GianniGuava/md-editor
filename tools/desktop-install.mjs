// @ts-check
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
 *   .md-desktop  marker: the script only ever replaces a folder that carries it. It is
 *                written first into a new folder and deleted last, so a folder left half
 *                made or half deleted by an interrupted run still carries it.
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
  /** @param {string} rel */
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
    const devUrl = fs
      .readFileSync(at(MAIN), 'utf8')
      .match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/);
    if (devUrl) {
      problems.push(
        `${MAIN} is a development build: its window loads ${devUrl[0]}, a dev server ` +
          'that only runs during `npm start`. Stop `npm start` if it is running, then run ' +
          '`npm run install:desktop`, which builds the production bundle first.',
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

/** @param {string} dir */
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

/**
 * Windows path equality: case, slash direction and a trailing slash do not matter.
 * @param {string} a
 * @param {string} b
 */
export const samePath = (a, b) => {
  /** @param {string} p */
  const norm = (p) =>
    path.win32
      .normalize(p)
      .replace(/[\\]+$/, '')
      .toLowerCase();
  return norm(a) === norm(b);
};

/**
 * The first argument of a shortcut's argument string, without its quotes.
 * @param {string} args
 * @returns {string | undefined}
 */
export const firstArgument = (args) => {
  const m = String(args).trim().match(/^"([^"]*)"|^(\S+)/);
  return m ? (m[1] ?? m[2]) : undefined;
};

/**
 * Whether `dir` is a checkout of this project (its package.json is md-editor).
 * @param {string} dir
 */
export const isMdApp = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 'md-editor';
  } catch {
    return false;
  }
};

const REPO_RUNTIME_TAIL = ['node_modules', 'electron', 'dist', 'electron.exe'];

/**
 * What to do with MD.lnk (`current` is null when there is no shortcut). Only a shortcut
 * that starts MD is changed: one already pointing at the install folder's runtime, or one
 * running a checkout of this project through a repo's Electron runtime (the old way, from
 * any checkout). Anything else is the user's and is left alone, including a shortcut whose
 * target reads back empty (one that starts a Store app or a special folder).
 * @param {{ target: string, args: string } | null} current
 * @param {{ installElectron: string, isMdApp: (dir: string) => boolean }} known
 * @returns {'create' | 'update' | 'leave'}
 */
export const shortcutDecision = (current, known) => {
  if (!current) return 'create';
  if (!current.target) return 'leave';
  if (samePath(current.target, known.installElectron)) return 'update';
  const parts = path.win32.normalize(current.target).split('\\');
  const tail = parts.slice(-REPO_RUNTIME_TAIL.length).map((p) => p.toLowerCase());
  const app = firstArgument(current.args ?? '');
  if (tail.join('\\') === REPO_RUNTIME_TAIL.join('\\') && app && known.isMdApp(app)) {
    return 'update';
  }
  return 'leave';
};

/**
 * The target (first line) and arguments (second line) printed by the PowerShell query.
 * An empty first line is kept: trimming the whole output would make the arguments look
 * like the target.
 * @param {string} text
 */
export const parseShortcutOutput = (text) => {
  const [target = '', args = ''] = String(text)
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split(/\r?\n/);
  return { target: target.trim(), args: args.trim() };
};

/**
 * Whether the script at `argv1` is this module, comparing real paths so that starting it
 * through a junction or symlink still counts (Node resolves the module's own path).
 * @param {string | undefined} argv1 process.argv[1]
 * @param {string} moduleUrl import.meta.url
 */
export const isEntryScript = (argv1, moduleUrl) => {
  if (argv1 === undefined) return false;
  /** @param {string} p */
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  return samePath(real(fileURLToPath(moduleUrl)), real(argv1));
};

/**
 * A plain explanation for the file-system errors a user can fix, or undefined.
 * @param {any} err
 * @returns {string | undefined}
 */
export const explain = (err) => {
  const where = err?.path ? ` (${err.path})` : '';
  switch (err?.code) {
    case 'EBUSY':
    case 'EPERM':
    case 'EACCES':
      return (
        `Windows would not let the install change a file${where}: ${err.code}. The file is ` +
        'usually in use (close every MD window, and any Explorer window or terminal open in ' +
        'the install folder) or read-only. Run this again once it is free.'
      );
    case 'ENOSPC':
      return (
        `The disk is full${where}. The install needs about 400 MB free, twice that when the ` +
        'Electron version changes. Free some space and run this again.'
      );
    default:
      return undefined;
  }
};

/**
 * Run every step, even after one throws; return the ones that failed.
 * @param {[string, () => unknown][]} steps
 * @returns {{ what: string, error: any }[]}
 */
export const runEach = (steps) => {
  const failures = [];
  for (const [what, step] of steps) {
    try {
      step();
    } catch (error) {
      failures.push({ what, error });
    }
  }
  return failures;
};

/** @param {string} dir */
const hasMarker = (dir) => fs.existsSync(path.join(dir, MARKER));

/**
 * Delete one of this script's folders, its marker last, so a delete that fails midway
 * leaves a folder the next run still recognises as its own.
 * @param {string} dir
 */
export const removeOurs = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name !== MARKER) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
  fs.rmSync(dir, { recursive: true, force: true });
};

/* ---------------- Running the install ---------------- */

export class Stop extends Error {}

/**
 * Run a PowerShell command and return its output. The console is switched to UTF-8
 * (without a byte-order mark) so non-ASCII paths come back intact.
 * @param {string} script
 * @param {Record<string, string>} [env]
 */
const runPowershell = (script, env = {}) =>
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ${script}`,
    ],
    { env: { ...process.env, ...env }, encoding: 'utf8' },
  );

/**
 * Refuse to touch a folder this script did not make. An empty folder is accepted: it
 * holds nothing to lose, and a run killed between creating a folder and writing its
 * marker leaves one.
 * @param {string} dir
 */
const assertOurs = (dir) => {
  if (!fs.existsSync(dir) || hasMarker(dir)) return;
  if (fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) return;
  throw new Stop(
    `${dir} exists but was not made by this script (no ${MARKER} marker), so it is left ` +
      'alone. Move it, or set MD_DESKTOP_DIR to another folder, and run again.',
  );
};

/**
 * Install (or reinstall) the desktop copy. Exported for the tests, which pass `log` and a
 * stand-in for `powershell`.
 * @param {{
 *   repoDir: string,
 *   installDir: string,
 *   shortcut: boolean,
 *   log?: (line: string) => void,
 *   powershell?: (script: string, env?: Record<string, string>) => string,
 * }} options
 */
export const install = ({
  repoDir,
  installDir,
  shortcut,
  log = (line) => console.log(`[install:desktop] ${line}`),
  powershell = runPowershell,
}) => {
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

  // An earlier run was killed after moving the installed copy aside: put it back first,
  // so the clean-up below can never delete the last working copy. Its runtime is not
  // reused below, since a delete that stopped partway may have left it incomplete.
  let recovered = false;
  if (!fs.existsSync(installDir) && hasMarker(old)) {
    const oldRuntime = path.join(old, 'runtime');
    const stagedRuntime = path.join(stage, 'runtime');
    if (!fs.existsSync(oldRuntime) && fs.existsSync(stagedRuntime)) {
      fs.renameSync(stagedRuntime, oldRuntime);
    }
    fs.renameSync(old, installDir);
    recovered = true;
    log(`Put back the copy an interrupted install had moved to ${old}.`);
  }

  // Leftovers from an interrupted run are ours (they carry the marker).
  removeOurs(stage);
  removeOurs(old);

  // Moving the current copy aside fails while MD runs from it: stop before changing anything.
  const hadInstall = fs.existsSync(installDir);
  if (hadInstall) {
    try {
      fs.renameSync(installDir, old);
    } catch (/** @type {any} */ err) {
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
  let keptProfile = false;
  try {
    fs.mkdirSync(stage);
    fs.writeFileSync(
      path.join(stage, MARKER),
      `MD desktop copy, installed ${new Date().toISOString()} from ${repoDir}\n`,
    );
    const appDir = path.join(stage, 'app');
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(repoDir, 'package.json'), path.join(appDir, 'package.json'));
    fs.copyFileSync(path.join(repoDir, ICON), path.join(appDir, ICON));
    for (const sub of ['.vite/build', '.vite/renderer']) {
      fs.cpSync(path.join(repoDir, sub), path.join(appDir, sub), { recursive: true });
    }

    const oldRuntime = path.join(old, 'runtime');
    if (hadInstall && !recovered && !runtimeNeedsCopy(srcDist, oldRuntime)) {
      fs.renameSync(oldRuntime, path.join(stage, 'runtime'));
      reusedRuntime = true;
    } else {
      fs.cpSync(srcDist, path.join(stage, 'runtime'), { recursive: true });
    }

    // A profile the installed copy made when started without --appdata lives in
    // app\.dev-userdata; carry it over rather than delete it with the old copy.
    const oldProfile = path.join(old, 'app', '.dev-userdata');
    if (hadInstall && fs.existsSync(oldProfile)) {
      fs.cpSync(oldProfile, path.join(appDir, '.dev-userdata'), { recursive: true });
      keptProfile = true;
    }

    const staged = checkBundle(appDir);
    if (!fs.existsSync(path.join(stage, 'runtime', 'electron.exe'))) {
      staged.push('runtime/electron.exe is missing from the copy.');
    }
    if (staged.length) throw new Stop(`The copied build failed its check:\n  - ${staged.join('\n  - ')}`);

    fs.renameSync(stage, installDir);
  } catch (err) {
    // Put the previous copy back exactly as it was. Each step runs even if one before it
    // fails, and the original error is the one reported.
    const stagedRuntime = path.join(stage, 'runtime');
    const oldRuntime = path.join(old, 'runtime');
    const failures = runEach([
      [
        'move the reused runtime back',
        () => {
          if (!reusedRuntime || !fs.existsSync(stagedRuntime)) return;
          try {
            fs.renameSync(stagedRuntime, oldRuntime);
          } catch {
            // Something may hold the staging folder; a copy still works.
            fs.rmSync(oldRuntime, { recursive: true, force: true });
            fs.cpSync(stagedRuntime, oldRuntime, { recursive: true });
          }
        },
      ],
      [
        'remove the unfinished copy',
        () => {
          // Never delete the only copy of the runtime: it stays in the marked staging
          // folder, which the next run cleans up.
          if (reusedRuntime && !fs.existsSync(path.join(oldRuntime, 'electron.exe'))) {
            throw new Error(`the runtime is still in ${stagedRuntime}`);
          }
          removeOurs(stage);
        },
      ],
      [
        'put the previous copy back',
        () => {
          if (hadInstall && !fs.existsSync(installDir) && fs.existsSync(old)) {
            fs.renameSync(old, installDir);
          }
        },
      ],
    ]);
    for (const { what, error } of failures) {
      log(`While undoing the install, could not ${what}: ${error.code ?? error.message}.`);
    }
    throw err;
  }

  try {
    removeOurs(old);
  } catch (/** @type {any} */ err) {
    log(`Could not remove the previous copy ${old} (${err.code}); it is removed on the next install.`);
  }

  const version = readVersion(path.join(installDir, 'runtime'));
  log(`Installed to ${installDir}`);
  log(`Electron ${version}, runtime ${reusedRuntime ? 'kept (same version)' : 'copied'}.`);
  if (keptProfile) log('Kept the profile in app\\.dev-userdata from the previous copy.');

  if (!shortcut) {
    log('Shortcut left alone (--no-shortcut).');
    return;
  }
  const installElectron = path.join(installDir, 'runtime', 'electron.exe');
  const appDir = path.join(installDir, 'app');
  const command = `"${installElectron}" "${appDir}" --appdata`;
  try {
    const desktop = powershell("[Environment]::GetFolderPath('Desktop')").trim();
    const lnk = path.join(desktop, 'MD.lnk');
    let current = null;
    if (fs.existsSync(lnk)) {
      current = parseShortcutOutput(
        powershell(
          '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:MD_LNK); $s.TargetPath; $s.Arguments',
          { MD_LNK: lnk },
        ),
      );
    }
    const decision = shortcutDecision(current, { installElectron, isMdApp });
    if (decision === 'leave') {
      log(
        current?.target
          ? `${lnk} starts ${current.target} ${current.args}, not MD, so it was left unchanged.`
          : `${lnk} has no file as its target (it may start a Store app or a special folder), ` +
              'so it was left unchanged.',
      );
      log(`To use the installed copy, make a shortcut to: ${command}`);
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
    log(`${decision === 'create' ? 'Created' : 'Updated'} ${lnk}. It now runs: ${command}`);
    log('Your session and drafts stay in %APPDATA%\\MD, as before.');
  } catch (/** @type {any} */ err) {
    const reason = String(err?.message ?? err).split(/\r?\n/)[0];
    throw new Stop(
      `MD was installed to ${installDir}, but the Desktop shortcut could not be set ` +
        `(${reason}). To finish by hand, right-click the Desktop, choose New > Shortcut, ` +
        `enter this as the location and name it MD:\n  ${command}`,
    );
  }
};

if (isEntryScript(process.argv[1], import.meta.url)) {
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
  } catch (/** @type {any} */ err) {
    console.error(`[install:desktop] ${err instanceof Stop ? err.message : (explain(err) ?? err.stack)}`);
    process.exit(1);
  }
}
