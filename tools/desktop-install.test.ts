// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  Stop,
  checkBundle,
  explain,
  firstArgument,
  install,
  isEntryScript,
  isMdApp,
  parseShortcutOutput,
  removeOurs,
  runEach,
  runtimeNeedsCopy,
  samePath,
  shortcutDecision,
} from './desktop-install.mjs';

let dir: string;

const write = (rel: string, text: string) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};

/** A minimal production layout, as `electron-forge package` leaves it. */
const productionLayout = () => {
  write('package.json', JSON.stringify({ main: '.vite/build/main.cjs' }));
  write(
    '.vite/build/main.cjs',
    'win.loadFile(path.join(__dirname, "../renderer/main_window/index.html"));',
  );
  write('.vite/build/preload.cjs', '"use strict";');
  write('.vite/renderer/main_window/index.html', '<!doctype html>');
  write('assets/app.ico', 'ico');
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-desktop-test-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('checkBundle', () => {
  it('passes a complete production layout', () => {
    productionLayout();
    expect(checkBundle(dir)).toEqual([]);
  });

  it('reports a missing renderer page', () => {
    productionLayout();
    fs.rmSync(path.join(dir, '.vite/renderer'), { recursive: true });
    expect(checkBundle(dir).join('\n')).toMatch(/renderer.*index\.html/);
  });

  it('reports a missing preload script', () => {
    productionLayout();
    fs.rmSync(path.join(dir, '.vite/build/preload.cjs'));
    expect(checkBundle(dir).join('\n')).toMatch(/preload\.cjs/);
  });

  it('reports a development build (dev-server address in main.cjs)', () => {
    productionLayout();
    write(
      '.vite/build/main.cjs',
      'const MAIN_WINDOW_VITE_DEV_SERVER_URL = "http://localhost:5173";',
    );
    expect(checkBundle(dir).join('\n')).toMatch(/development build/);
  });

  it('reports a missing main process bundle', () => {
    productionLayout();
    fs.rmSync(path.join(dir, '.vite/build/main.cjs'));
    expect(checkBundle(dir).join('\n')).toMatch(/main\.cjs is missing/);
  });

  it('reports a development build that uses 127.0.0.1 or [::1]', () => {
    for (const host of ['127.0.0.1', '[::1]']) {
      productionLayout();
      write('.vite/build/main.cjs', `const URL = "http://${host}:5173";`);
      expect(checkBundle(dir).join('\n')).toMatch(/development build/);
    }
  });

  it('reports a package.json whose main is not the built bundle', () => {
    productionLayout();
    write('package.json', JSON.stringify({ main: 'src/main/main.ts' }));
    expect(checkBundle(dir).join('\n')).toMatch(/package\.json/);
  });

  it('reports a missing app icon', () => {
    productionLayout();
    fs.rmSync(path.join(dir, 'assets/app.ico'));
    expect(checkBundle(dir).join('\n')).toMatch(/app\.ico/);
  });
});

describe('runtimeNeedsCopy', () => {
  it('copies when the installed runtime is missing', () => {
    write('src/version', '44.8.0');
    expect(runtimeNeedsCopy(path.join(dir, 'src'), path.join(dir, 'dest'))).toBe(true);
  });

  it('copies when the versions differ', () => {
    write('src/version', '44.8.0');
    write('dest/version', '44.7.1');
    write('dest/electron.exe', 'exe');
    expect(runtimeNeedsCopy(path.join(dir, 'src'), path.join(dir, 'dest'))).toBe(true);
  });

  it('copies when the installed runtime has no electron.exe', () => {
    write('src/version', '44.8.0');
    write('dest/version', '44.8.0');
    expect(runtimeNeedsCopy(path.join(dir, 'src'), path.join(dir, 'dest'))).toBe(true);
  });

  it('skips the copy when the versions match', () => {
    write('src/version', '44.8.0\n');
    write('dest/version', '44.8.0');
    write('dest/electron.exe', 'exe');
    expect(runtimeNeedsCopy(path.join(dir, 'src'), path.join(dir, 'dest'))).toBe(false);
  });
});

describe('samePath', () => {
  it('ignores case, slash direction and a trailing slash', () => {
    expect(samePath('C:\\Users\\X\\md-editor\\', 'c:/users/x/MD-editor')).toBe(true);
  });

  it('tells different paths apart', () => {
    expect(samePath('C:\\a\\electron.exe', 'C:\\b\\electron.exe')).toBe(false);
  });
});

describe('firstArgument', () => {
  it('reads a quoted first argument', () => {
    expect(firstArgument('"C:\\Users\\X\\md editor" --appdata')).toBe('C:\\Users\\X\\md editor');
  });

  it('reads an unquoted first argument', () => {
    expect(firstArgument('C:\\Users\\X\\md-editor --appdata')).toBe('C:\\Users\\X\\md-editor');
  });

  it('gives undefined for no arguments', () => {
    expect(firstArgument('   ')).toBeUndefined();
  });
});

describe('shortcutDecision', () => {
  const mdRepos = ['c:\\users\\x\\md-editor', 'c:\\users\\x\\md-editor\\.claude\\worktrees\\fix'];
  const known = {
    installElectron: 'C:\\Users\\X\\AppData\\Local\\MD-desktop\\runtime\\electron.exe',
    isMdApp: (dir: string) => mdRepos.some((r) => samePath(r, dir)),
  };
  const repoRuntime = 'C:\\Users\\X\\md-editor\\node_modules\\electron\\dist\\electron.exe';

  it('creates the shortcut when there is none', () => {
    expect(shortcutDecision(null, known)).toBe('create');
  });

  it("updates a shortcut that runs an MD repo through that repo's runtime", () => {
    expect(
      shortcutDecision({ target: repoRuntime, args: '"C:\\Users\\X\\md-editor" --appdata' }, known),
    ).toBe('update');
  });

  it('updates it even when the install runs from a different checkout of the repo', () => {
    // The original bug in this script: it only knew the runtime of the checkout it ran from.
    expect(
      shortcutDecision(
        { target: repoRuntime, args: '"C:\\Users\\X\\md-editor" --appdata' },
        { ...known, isMdApp: (dir: string) => samePath(dir, mdRepos[0]) },
      ),
    ).toBe('update');
  });

  it('updates a shortcut that already points at the install folder', () => {
    expect(
      shortcutDecision({ target: known.installElectron, args: '"anything" --appdata' }, known),
    ).toBe('update');
  });

  it('leaves an Electron shortcut that runs some other app', () => {
    expect(
      shortcutDecision(
        {
          target: 'C:\\Users\\X\\other\\node_modules\\electron\\dist\\electron.exe',
          args: '"C:\\Users\\X\\other"',
        },
        known,
      ),
    ).toBe('leave');
  });

  it('leaves an existing shortcut whose target is not a file (empty target)', () => {
    // A shortcut to a Store app or a special folder reads back with an empty TargetPath.
    expect(shortcutDecision({ target: '', args: '' }, known)).toBe('leave');
    expect(shortcutDecision({ target: '', args: '"C:\\Users\\X\\md-editor"' }, known)).toBe(
      'leave',
    );
  });

  it('leaves a shortcut that is not Electron even when its argument is an MD repo', () => {
    expect(
      shortcutDecision(
        {
          target: 'C:\\Program Files\\Notepad++\\notepad++.exe',
          args: '"C:\\Users\\X\\md-editor"',
        },
        known,
      ),
    ).toBe('leave');
  });

  it('matches the repo runtime path in any letter case', () => {
    expect(
      shortcutDecision(
        {
          target: 'C:\\Users\\X\\md-editor\\NODE_MODULES\\Electron\\DIST\\Electron.EXE',
          args: '"C:\\Users\\X\\md-editor" --appdata',
        },
        known,
      ),
    ).toBe('update');
  });

  it('leaves a shortcut that points somewhere else', () => {
    expect(
      shortcutDecision({ target: 'C:\\Program Files\\Other\\other.exe', args: '' }, known),
    ).toBe('leave');
  });
});

describe('isMdApp', () => {
  it('accepts a folder whose package.json is md-editor', () => {
    write('repo/package.json', JSON.stringify({ name: 'md-editor', productName: 'MD' }));
    expect(isMdApp(path.join(dir, 'repo'))).toBe(true);
  });

  it('rejects another package and a folder without package.json', () => {
    write('other/package.json', JSON.stringify({ name: 'other' }));
    expect(isMdApp(path.join(dir, 'other'))).toBe(false);
    expect(isMdApp(path.join(dir, 'nothing'))).toBe(false);
  });
});

describe('parseShortcutOutput', () => {
  it('keeps an empty target line instead of reading the arguments as the target', () => {
    expect(parseShortcutOutput('\r\n"C:\\Users\\X\\md-editor" --appdata\r\n')).toEqual({
      target: '',
      args: '"C:\\Users\\X\\md-editor" --appdata',
    });
  });

  it('drops a byte-order mark and Windows line endings', () => {
    expect(parseShortcutOutput('\uFEFFC:\\a\\electron.exe\r\n"C:\\Café"\r\n')).toEqual({
      target: 'C:\\a\\electron.exe',
      args: '"C:\\Café"',
    });
  });

  it('gives empty strings for empty output', () => {
    expect(parseShortcutOutput('')).toEqual({ target: '', args: '' });
  });
});

describe('isEntryScript', () => {
  it('recognises the script when it is started through a symlink or junction', () => {
    write('real/script.mjs', '');
    const real = path.join(dir, 'real', 'script.mjs');
    const link = path.join(dir, 'link');
    fs.symlinkSync(path.join(dir, 'real'), link, 'junction');
    expect(isEntryScript(path.join(link, 'script.mjs'), pathToFileURL(real).href)).toBe(true);
  });

  it('is false for another script or no script', () => {
    write('a.mjs', '');
    write('b.mjs', '');
    const url = pathToFileURL(path.join(dir, 'a.mjs')).href;
    expect(isEntryScript(path.join(dir, 'b.mjs'), url)).toBe(false);
    expect(isEntryScript(undefined, url)).toBe(false);
  });
});

describe('explain', () => {
  const err = (code: string) =>
    Object.assign(new Error(`${code}: something`), { code, path: 'C:\\x\\file' });

  it('explains a file in use in plain words', () => {
    for (const code of ['EBUSY', 'EPERM', 'EACCES']) {
      const text = explain(err(code));
      expect(text).toMatch(/in use/);
      expect(text).toContain('C:\\x\\file');
    }
  });

  it('explains a full disk in plain words', () => {
    expect(explain(err('ENOSPC'))).toMatch(/disk is full/);
  });

  it('gives nothing for other errors, so the caller shows the details', () => {
    expect(explain(err('EWHATEVER'))).toBeUndefined();
    expect(explain(new Error('plain'))).toBeUndefined();
  });
});

describe('runEach', () => {
  it('runs every step even when an earlier one throws, and returns the failures', () => {
    const ran: string[] = [];
    const failures = runEach([
      ['first', () => ran.push('first')],
      [
        'second',
        () => {
          throw new Error('boom');
        },
      ],
      ['third', () => ran.push('third')],
    ]);
    expect(ran).toEqual(['first', 'third']);
    expect(failures.map((f: { what: string }) => f.what)).toEqual(['second']);
  });
});

/* ---------------- install() against temporary folders ---------------- */

// These tests lock a file or folder with chmod. On Windows chmod only sets the read-only
// flag, which neither stops reading nor (for Node) deleting, and root ignores permissions.
const cannotLock =
  process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0);

describe('removeOurs', () => {
  it.skipIf(cannotLock)('deletes the marker last, so a half-deleted folder is still ours', () => {
    write('inst/.md-desktop', 'marker');
    write('inst/a/locked/file', 'x');
    const locked = path.join(dir, 'inst', 'a', 'locked');
    fs.chmodSync(locked, 0o555);
    try {
      expect(() => removeOurs(path.join(dir, 'inst'))).toThrow();
      expect(fs.existsSync(path.join(dir, 'inst', '.md-desktop'))).toBe(true);
    } finally {
      fs.chmodSync(locked, 0o755);
    }
    removeOurs(path.join(dir, 'inst'));
    expect(fs.existsSync(path.join(dir, 'inst'))).toBe(false);
  });

  it('does nothing when the folder is missing', () => {
    expect(() => removeOurs(path.join(dir, 'nothing'))).not.toThrow();
  });
});

describe('install', () => {
  let repo: string;
  let inst: string;
  let lines: string[];

  const makeRepo = (version = '44.8.0') => {
    write('repo/package.json', JSON.stringify({ name: 'md-editor', main: '.vite/build/main.cjs' }));
    write('repo/.vite/build/main.cjs', 'win.loadFile("../renderer/main_window/index.html");');
    write('repo/.vite/build/preload.cjs', '"use strict";');
    write('repo/.vite/renderer/main_window/index.html', '<!doctype html>');
    write('repo/assets/app.ico', 'ico');
    write('repo/node_modules/electron/dist/electron.exe', `exe ${version}`);
    write('repo/node_modules/electron/dist/ffmpeg.dll', 'dll');
    write('repo/node_modules/electron/dist/version', version);
  };

  const run = (extra: Record<string, unknown> = {}) =>
    install({
      repoDir: repo,
      installDir: inst,
      shortcut: false,
      log: (l: string) => lines.push(l),
      ...extra,
    });

  const read = (rel: string) => fs.readFileSync(path.join(inst, rel), 'utf8');

  beforeEach(() => {
    repo = path.join(dir, 'repo');
    inst = path.join(dir, 'MD-desktop');
    lines = [];
    makeRepo();
  });

  it('installs app, runtime and marker into a new folder', () => {
    run();
    expect(read('app/.vite/renderer/main_window/index.html')).toBe('<!doctype html>');
    expect(read('app/assets/app.ico')).toBe('ico');
    expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
    expect(fs.existsSync(path.join(inst, '.md-desktop'))).toBe(true);
    expect(fs.existsSync(`${inst}.new`)).toBe(false);
    expect(fs.existsSync(`${inst}.old`)).toBe(false);
    expect(lines.join('\n')).toMatch(/Installed to/);
  });

  it('keeps the runtime when the version is unchanged, and removes the previous copy', () => {
    run();
    fs.appendFileSync(path.join(inst, 'runtime', 'electron.exe'), ' (installed)');
    write('repo/.vite/renderer/main_window/index.html', '<!doctype html><p>v2');
    lines = [];
    run();
    expect(read('runtime/electron.exe')).toBe('exe 44.8.0 (installed)');
    expect(read('app/.vite/renderer/main_window/index.html')).toContain('v2');
    expect(lines.join('\n')).toMatch(/kept/);
    expect(fs.existsSync(`${inst}.old`)).toBe(false);
  });

  it('copies a new runtime when the version changes', () => {
    run();
    makeRepo('45.0.0');
    run();
    expect(read('runtime/electron.exe')).toBe('exe 45.0.0');
  });

  it('refuses a folder it did not make and leaves it untouched', () => {
    write('MD-desktop/mine.txt', 'keep');
    expect(() => run()).toThrow(Stop);
    expect(read('mine.txt')).toBe('keep');
  });

  it('refuses a development build and leaves the installed copy unchanged', () => {
    run();
    write('repo/.vite/build/main.cjs', 'loadURL("http://localhost:5173")');
    expect(() => run()).toThrow(/development build/);
    expect(read('app/.vite/build/main.cjs')).toContain('loadFile');
  });

  it("removes a marked leftover from an interrupted run's staging folder", () => {
    write('MD-desktop.new/.md-desktop', 'marker');
    write('MD-desktop.new/app/half', 'x');
    run();
    expect(fs.existsSync(`${inst}.new`)).toBe(false);
    expect(fs.existsSync(path.join(inst, 'app', 'half'))).toBe(false);
  });

  it('puts the previous copy back when an earlier run was killed mid-install', () => {
    run();
    // State after a kill between moving the copy aside and the swap, with the runtime
    // already moved into the staging folder.
    fs.renameSync(inst, `${inst}.old`);
    fs.mkdirSync(`${inst}.new`);
    fs.writeFileSync(path.join(`${inst}.new`, '.md-desktop'), 'marker');
    fs.renameSync(path.join(`${inst}.old`, 'runtime'), path.join(`${inst}.new`, 'runtime'));
    run();
    expect(lines.join('\n')).toMatch(/interrupted/);
    expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
    expect(fs.existsSync(`${inst}.old`)).toBe(false);
    expect(fs.existsSync(`${inst}.new`)).toBe(false);
  });

  it('takes over an empty staging or install folder an interrupted run left without a marker', () => {
    // A kill between creating the folder and writing its marker; an empty folder holds
    // nothing to lose.
    fs.mkdirSync(`${inst}.new`);
    fs.mkdirSync(inst);
    run();
    expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
    expect(fs.existsSync(`${inst}.new`)).toBe(false);
  });

  it('copies a fresh runtime after putting back an interrupted copy, instead of reusing it', () => {
    run();
    // An earlier delete of .old stopped partway, then the install folder was deleted by hand.
    fs.renameSync(inst, `${inst}.old`);
    fs.rmSync(path.join(`${inst}.old`, 'runtime', 'ffmpeg.dll'));
    run();
    expect(read('runtime/ffmpeg.dll')).toBe('dll');
    expect(lines.join('\n')).toMatch(/runtime copied/);
  });

  it('keeps the runtime when moving it back fails during an undo', () => {
    run();
    const realRename = fs.renameSync;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      const f = String(from);
      // The final swap and the runtime's move back both fail, as when something holds
      // the staging folder open.
      if (f === `${inst}.new` || f === path.join(`${inst}.new`, 'runtime')) {
        throw Object.assign(new Error(`EPERM: rename ${f}`), { code: 'EPERM', path: f });
      }
      return realRename(from, to);
    });
    try {
      expect(() => run()).toThrow(expect.objectContaining({ code: 'EPERM' }));
    } finally {
      spy.mockRestore();
    }
    expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
    expect(read('runtime/ffmpeg.dll')).toBe('dll');
    expect(read('app/.vite/renderer/main_window/index.html')).toBe('<!doctype html>');
  });

  it.skipIf(cannotLock)(
    'keeps the last working copy when a run after a killed one also fails',
    () => {
      run();
      fs.renameSync(inst, `${inst}.old`);
      write('repo/.vite/renderer/main_window/unreadable.js', 'x');
      const unreadable = path.join(repo, '.vite/renderer/main_window/unreadable.js');
      fs.chmodSync(unreadable, 0o000);
      try {
        expect(() => run()).toThrow();
      } finally {
        fs.chmodSync(unreadable, 0o644);
      }
      expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
      expect(read('app/.vite/renderer/main_window/index.html')).toBe('<!doctype html>');
    },
  );

  it.skipIf(cannotLock)('restores the previous copy exactly when copying the build fails', () => {
    run();
    write('repo/.vite/renderer/main_window/unreadable.js', 'x');
    const unreadable = path.join(repo, '.vite/renderer/main_window/unreadable.js');
    fs.chmodSync(unreadable, 0o000);
    try {
      expect(() => run()).toThrow(expect.objectContaining({ code: 'EACCES' }));
    } finally {
      fs.chmodSync(unreadable, 0o644);
    }
    expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
    expect(fs.existsSync(path.join(inst, 'app', '.vite', 'renderer', 'main_window', 'unreadable.js'))).toBe(false);
    expect(fs.existsSync(`${inst}.new`)).toBe(false);
    expect(fs.existsSync(`${inst}.old`)).toBe(false);
  });

  it.skipIf(cannotLock)('moves a reused runtime back when a later step fails', () => {
    run();
    write('MD-desktop/app/.dev-userdata/locked', 'x');
    const locked = path.join(inst, 'app/.dev-userdata/locked');
    fs.chmodSync(locked, 0o000);
    try {
      expect(() => run()).toThrow();
      expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
      expect(fs.existsSync(locked)).toBe(true);
    } finally {
      fs.chmodSync(locked, 0o644);
    }
  });

  it('carries a profile in app\\.dev-userdata over to the new copy', () => {
    run();
    write('MD-desktop/app/.dev-userdata/session.json', '{"tabs":[]}');
    run();
    expect(read('app/.dev-userdata/session.json')).toBe('{"tabs":[]}');
  });

  describe('Desktop shortcut', () => {
    let desktop: string;
    let lnk: string;
    let writes: Record<string, string>[];

    const stub =
      (shortcutText: string | null, fail = false) =>
      (script: string, env: Record<string, string> = {}) => {
        if (fail) throw new Error('powershell.exe was not found\n    at stack line');
        if (script.includes('GetFolderPath')) return desktop;
        if (script.includes('$s.Save()')) {
          writes.push(env);
          return '';
        }
        return shortcutText ?? '';
      };

    beforeEach(() => {
      desktop = path.join(dir, 'Desktop');
      lnk = path.join(desktop, 'MD.lnk');
      fs.mkdirSync(desktop);
      writes = [];
    });

    it('retargets a shortcut that ran the repo, and says what it now runs', () => {
      fs.writeFileSync(lnk, 'lnk');
      const target = path.join(repo, 'node_modules', 'electron', 'dist', 'electron.exe');
      run({ shortcut: true, powershell: stub(`${target}\r\n"${repo}" --appdata\r\n`) });
      expect(writes).toHaveLength(1);
      expect(writes[0].MD_TARGET).toBe(path.join(inst, 'runtime', 'electron.exe'));
      expect(writes[0].MD_ARGS).toBe(`"${path.join(inst, 'app')}" --appdata`);
      expect(lines.join('\n')).toMatch(/now runs/);
    });

    it('leaves an existing shortcut with an empty target alone', () => {
      fs.writeFileSync(lnk, 'lnk');
      run({ shortcut: true, powershell: stub('\r\n\r\n') });
      expect(writes).toHaveLength(0);
      expect(lines.join('\n')).toMatch(/left unchanged/);
    });

    it('creates the shortcut when there is none', () => {
      run({ shortcut: true, powershell: stub(null) });
      expect(writes).toHaveLength(1);
    });

    it('explains how to finish by hand when the shortcut step fails after a good install', () => {
      let caught: unknown;
      try {
        run({ shortcut: true, powershell: stub(null, true) });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Stop);
      const text = (caught as Error).message;
      expect(text).toMatch(/installed/i);
      expect(text).toContain(path.join(inst, 'runtime', 'electron.exe'));
      expect(text).not.toMatch(/at stack line/);
      expect(read('runtime/electron.exe')).toBe('exe 44.8.0');
    });
  });
});
