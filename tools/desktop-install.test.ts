// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkBundle,
  firstArgument,
  isMdApp,
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
