# Fix: blank desktop window after `npm start` (2026-11-14)

Size: Medium (build-workflow). Branch: `fix/desktop-shortcut-build`, local until Gianni says to push.

## Spec

### What and why

The Desktop shortcut `MD.lnk` starts the app as
`node_modules\electron\dist\electron.exe "C:\Users\giann\md-editor" --appdata`, so it runs whatever build is in the repo's `.vite/` folder. `npm start` (Electron Forge's dev mode) empties `.vite/` and writes a development build whose window loads `http://localhost:5173`, a dev server that exists only while `npm start` runs. After any `npm start`, the shortcut therefore opens a blank window (`did-fail-load -102 ERR_CONNECTION_REFUSED http://localhost:5173/`, reproduced 2026-11-14). A second weakness: npm 11 skips install scripts not covered by `allowScripts`, so `npm ci` can leave `node_modules\electron\dist\electron.exe` missing, and the shortcut then points at nothing.

The fix gives the desktop app its own folder outside the repo: a copy of a verified production build plus its own copy of the signed Electron runtime. The shortcut points there, so nothing done in the repo (dev runs, reinstalls, branch switches) can break it until the next deliberate install.

### Who uses it

Gianni, on this Windows 11 PC, starting MD from the Desktop shortcut and developing it in `C:\Users\giann\md-editor`.

### Out of scope

- An in-window message when a dev build has no dev server (option A, not chosen).
- Running the packaged `md.exe` (blocked by Smart App Control, `src/main/main.ts:52-55`), code signing, the Squirrel installer.
- A Start menu entry, file associations ("Open with"), the web build.
- The duplicate shortcut `MD (2).lnk`: left as it is, still pointing at the repo (Gianni, 2026-11-14, answer 3 b).

### Decided

- 2026-11-14, Gianni: "1 yes 2 b 3 a 4 yes". That is: restore the checkout now (done: main at a2c6288, `npm install`, `npm run package`); guard option B, a separate desktop build folder plus a new shortcut target; spec and plan in this note; run the notebook scan.

- 2026-11-14, Gianni, on the plan's open questions: "1 yes 2 delete 3 b 4 yes". That is: install folder `%LOCALAPPDATA%\MD-desktop`; no previous copy is kept (the old install is deleted after a successful install); only `MD.lnk` is retargeted; build it.

### Done checks (each pass or fail, by looking)

1. `npm run install:desktop` finishes with a plain summary; the Desktop shortcut then opens the editor and preview with the MD icon.
2. Run `npm start`, close it, then use the shortcut: the editor opens, not a blank window (the original bug).
3. With the repo's `node_modules\electron\dist` renamed away, the shortcut still opens the editor.
4. Running the install while MD is open stops with a message saying to close MD first, and the installed copy still works.
5. Running the install on a development build stops with a message naming the problem, and the installed copy is unchanged.
6. The shortcut uses the same session as before: the tabs from `%APPDATA%\MD` come back.
7. `npm run check` and `npm run test:e2e` pass.
8. Gianni's list: a short document fills the window with a one-line status bar at the bottom; previous tabs come back after a restart; open, edit and save a Markdown file and its line endings are kept; a Notepad file with a byte-order mark is written back byte for byte; a Windows-1252 file with "é" opens correctly and shows the notice that saving writes UTF-8; export to HTML and to PDF work.

## Plan

### Change list

1. `tools/desktop-install.mjs` (new, run by Node directly): checks the fresh production build in `.vite/`, assembles the install in a staging folder (`app/` holding `package.json`, `.vite/` and `assets/app.ico`; `runtime/` holding a copy of `node_modules\electron\dist`, copied only when the Electron version differs), checks the staged copy again, swaps it into place, and retargets the Desktop shortcut `MD.lnk`. The checks are exported as small functions so they can be unit-tested.
2. `tools/desktop-install.test.ts` (new): unit tests for those functions.
3. `package.json`: script `"install:desktop": "electron-forge package && node tools/desktop-install.mjs"`. No new dependency.
4. `vitest.config.mts` and `tsconfig.json`: include `tools/**/*.ts` so the new file is tested, typechecked and linted with the rest.
5. `README.md`: a "Desktop shortcut" section: what the install does, when to rerun it (after pulling changes you want on the desktop), and that `npm start` no longer affects it.
6. This note, with a "Changes during the build" section if anything moves from the plan.

Outside the repo (approved with option B): the install folder, and the target, arguments, working folder and icon of the Desktop shortcuts. No source file under `src/` changes.

### Test list

Unit (`tools/desktop-install.test.ts`):

- A complete production layout passes the bundle check.
- A missing `.vite/renderer/main_window/index.html` is reported.
- A missing `.vite/build/preload.cjs` is reported.
- A `main.cjs` containing a dev-server address (`http://localhost:`) is reported as a development build.
- The runtime is copied when the installed copy is missing or its `version` file differs, and skipped when it matches.
- The shortcut matcher updates a shortcut that points at the install folder, or that runs a checkout of md-editor (by its package.json) through a repo's `electron.exe`, from any checkout; it leaves other shortcuts alone.

Live: done checks 1 to 8, each with the command and output or a screenshot. What must keep working: the e2e suite (it still runs from the repo's `.vite/`), `npm start`, `npm run package`, `npm run make`.

### Order of slices

1. Bundle check and runtime-copy decision, with their unit tests.
2. Staging, verify and swap, including the "MD is open" stop.
3. Shortcut retargeting.
4. README, then the live done checks.
5. The scan (Sonnet at xhigh, then Opus and Fable checkers at high), fixes for in-scope findings, the report, and the push only on Gianni's yes.

### Risks

- Smart App Control may block `electron.exe` copied to a new folder. It would show as the shortcut doing nothing, or a Windows notice. The copy keeps Microsoft's view of the signed file (the signature is inside the file), so this is unlikely [INFERRED]; done check 1 tests it directly. Fallback: point the shortcut at the repo's runtime and keep only the app copy separate.
- Windows refuses to rename the install folder while MD runs. It would show as the install failing midway; slice 2 stops before touching anything (done check 4).
- The Desktop is in OneDrive, which syncs shortcut changes to other PCs where the target folder does not exist. It would show as a broken shortcut on another machine; noted, not fixed here.
- Disk space: about 370 MB for the runtime, twice that for a moment during an install that copies a new runtime.

### Cost

About $13 to $15 from here [INFERRED]: build and tests about $5 to $7, live checks about $3, the scan about $5.

## Changes during the build

- The install script is `tools/desktop-install.mjs` (plain JavaScript, like `tools/build-logo.mjs`), not `.ts`: TypeScript would need `allowImportingTsExtensions` for the test to import a `.ts` file run directly by Node. The test stays TypeScript; `tsconfig.json` includes `tools/**/*.ts` and checks the script through it. Claude's call, 2026-11-14.
- Safety added: the script only replaces or deletes a folder carrying its `.md-desktop` marker, and it refuses to change `MD.lnk` when that shortcut points at another program. Claude's call, 2026-11-14.
- Found in the first live install: the shortcut matcher compared `MD.lnk` with the runtime of the checkout running the script (the fix-branch folder), so it left the real shortcut, which points at the main checkout, unchanged. It now recognises any shortcut that runs an md-editor checkout through a repo's Electron runtime; tests added first (they failed, then passed). Claude, 2026-11-14.
- Done checks 2 and 5 used `npm start` in the fix-branch folder, not the main checkout, so the main checkout's `.vite/` (which `MD (2).lnk` still uses) was not disturbed. The installed copy references neither checkout (check 3). Claude, 2026-11-14.
- `README.md`: the Smart App Control section now describes `npm run install:desktop`. The old example path there contained a tab character where a backslash followed by t had been typed (`C:\path<tab>o\md-editor`); that line is replaced. Claude's call, 2026-11-14.
