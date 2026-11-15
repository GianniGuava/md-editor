# Handoff: md-editor desktop blank window (2026-11-14)

Written 2026-11-14 on Gianni's Windows 11 PC ("this PC") at the end of chat "01 md-editor: desktop blank window" (tag `project:md-editor`). Next chat title: **02 md-editor: desktop blank window**.

Why this file is in the repo and not on the NAS: the notebook says handoffs go to `/mnt/code/_share/work/md-editor/`, but no NAS share is mapped on this PC (only drives C, D, E), so neither `_share/` nor the status page could be reached. The file is committed on the fix branch so another machine can get it once the branch is on GitHub. On the other machine, copy it to `/mnt/code/_share/work/md-editor/2026-11-14-handoff-desktop-blank-window.md` and add the memory pointer there. No status note was written for chat 01 (NAS unreachable); the next chat should write its own.

## 1. Goal and why

Gianni's words: "The MD desktop app (Electron, my md-editor repo, git@github.com:GianniGuava/md-editor.git) shows a blank window since I merged pull request #2 into main (merge commit a2c6288, 2026-11-14). Before the merge, main was e032486 and the app worked. Find out why, fix it, and verify the desktop app works. Follow my notebook rules as usual (plan before a nontrivial change, fix on its own branch, the repo's checks and the scan before the push)."

He asked to be told the cause with evidence before any change, and for these checks on this PC, each pass or fail: `npm run check` and `npm run test:e2e`; the app starts and shows the editor and preview, a short document fills the window with a one-line status bar at the bottom; previous tabs come back after a restart; open, edit and save a Markdown file with its own line endings; a Notepad file with a byte-order mark written back byte for byte; a Windows-1252 file with an accented letter opens correctly and shows the notice that saving writes UTF-8; export to HTML and PDF work.

## 2. The cause (found, with evidence)

Not PR #2's code. All [VERIFIED] on this PC, 2026-11-14:

- This PC's checkout `C:\Users\giann\md-editor` was still on e032486; the merge reached it only with `git fetch` in chat 01. `git reflog` showed no pull.
- The Desktop shortcut `C:\Users\giann\OneDrive\Desktop\MD.lnk` (and a duplicate `MD (2).lnk`) ran `C:\Users\giann\md-editor\node_modules\electron\dist\electron.exe "C:\Users\giann\md-editor" --appdata`, i.e. whatever bundle is in the repo's `.vite/`. The packaged `md.exe` is not used because Smart App Control blocks the unsigned exe (`src/main/main.ts:52-55`, README).
- `npm start` was run at 15:35 that day (file times of `.vite/build/main.cjs` and `.dev-userdata/session.json`). Electron Forge's dev mode empties `.vite/` and writes a dev build: `.vite/build/main.cjs` contains `http://localhost:5173` and there is no `.vite/renderer/`.
- Running the shortcut's command against a copy of the session printed `[md] did-fail-load -102 ERR_CONNECTION_REFUSED http://localhost:5173/` (window load at `src/main/main.ts:279`, `win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)`).
- The merge itself works in Electron: a2c6288 built with `npm run package` in a separate worktree rendered normally with a copy of the real session (tabs, toolbar, both panes, one-line status bar), and also under `npm start`, even with `idb-keyval` removed. Bisect not needed.
- Side finding: npm 11 skips install scripts not listed in `allowScripts`; `npm install` printed "install scripts not yet covered by allowScripts", and `npm ci` in a fresh worktree left `node_modules/electron/dist/electron.exe` missing (fixed by `node node_modules/electron/install.js`).

## 3. Decisions (Gianni's words, all 2026-11-14)

- On the first plan: "1 yes 2 b  3 a 4 yes". Meaning: (1) restore the checkout now (pull main, `npm install`, check electron.exe, `npm run package`); (2) guard option B: a separate desktop build folder outside the repo plus a new shortcut target (option A, an in-window message, was not chosen; option C, run `md.exe`, is blocked by Smart App Control; option D, README only, not chosen); (3) spec and plan in one note `docs/fixes/2026-11-14-blank-window.md`; (4) run the notebook scan, with briefs written in the session because the templates on claude-dev were unreachable.
- On the plan's open questions: "1 yes 2 delete 3 b 4 yes". Meaning: install folder `%LOCALAPPDATA%\MD-desktop`; keep no previous copy (old install deleted after a successful install); retarget only `MD.lnk`, leave `MD (2).lnk` pointing at the repo; build it.
- Then: "make a handoff to return back to my other machine of all your findings" (this file).
- Not yet answered: the fix plan for the scan findings and an Opus re-check (section 5).

## 4. Where things stand

Done, all on this PC:

- Checkout restored: `C:\Users\giann\md-editor` main fast-forwarded to a2c6288, `npm install` (added idb-keyval, fake-indexeddb), `npm run package`. The shortcut command worked again before the fix.
- Session backups (copies, nothing moved): `C:\Users\giann\AppData\Local\Temp\claude\d0b7076732833b77\bbecf166-7de3-4dfc-a763-027da46c45d7\scratchpad\session-backup-appdata\` (from `%APPDATA%\MD`) and `...\scratchpad\session-backup-dev\` (from `.dev-userdata`). The scratchpad can be cleared by Windows; the real sessions are untouched.
- Fix branch `fix/desktop-shortcut-build`, **local only, not pushed**, in worktree `C:\Users\giann\md-editor\.claude\worktrees\fix-desktop-shortcut` (excluded via `.git/info/exclude`). Commits on top of a2c6288:
  - `7a37d58` Install the desktop copy outside the repo so npm start cannot blank it
  - `9db73d9` Recognise MD shortcuts from any checkout; clearer dev-build message
  - plus the commit adding this handoff.
- What the fix is: `npm run install:desktop` = `electron-forge package && node tools/desktop-install.mjs`. The script checks the build (refuses a dev build or missing files), stages `app\` (package.json, `.vite\build`, `.vite\renderer`, `assets\app.ico`) and `runtime\` (copy of `node_modules\electron\dist`, reused by rename when the version matches) in `MD-desktop.new`, renames the old install to `MD-desktop.old` (fails with EPERM while MD runs, so it stops), swaps, deletes `.old`, and retargets `MD.lnk` to `%LOCALAPPDATA%\MD-desktop\runtime\electron.exe "%LOCALAPPDATA%\MD-desktop\app" --appdata` (working dir `app`, icon `app\assets\app.ico,0`). It only touches folders with a `.md-desktop` marker and only shortcuts that already start MD. Files: `tools/desktop-install.mjs`, `tools/desktop-install.test.ts`, `package.json` (script), `tsconfig.json` and `vitest.config.mts` (include `tools/**/*.ts`), `README.md` (Smart App Control section rewritten; it also had a literal tab typed as `\t` in an example path, replaced), `docs/fixes/2026-11-14-blank-window.md` (spec, plan, done checks, "Changes during the build").
- Installed for real on this PC: `C:\Users\giann\AppData\Local\MD-desktop`, Electron 44.8.0. `MD.lnk` retargeted; `MD (2).lnk` still `C:\Users\giann\md-editor\node_modules\electron\dist\electron.exe`.
- Verification, each [VERIFIED] 2026-11-14:

| Check | Result |
|---|---|
| `npm run check`, branch (typecheck, lint, 138 unit tests) | pass |
| `npm run check`, main checkout | typecheck, lint, 115 tests pass; format step reports 6 files, all inside the nested worktree folder (see open items) |
| `npm run test:e2e`, branch and main checkout (3 tests) | pass |
| Starts with editor and preview; short document fills the window; one-line status bar at the bottom | pass |
| Previous tabs come back after a restart | pass |
| Open, edit, save: CRLF line endings kept | pass |
| Notepad file with BOM written back byte for byte (47 of 47 bytes identical) | pass |
| Windows-1252 file shows "Café", "Résumé naïve" and the UTF-8 notice | pass |
| Export HTML (5577 bytes) and PDF (17825 bytes, `%PDF-1.4`) | pass |
| Real `MD.lnk` opens window "PLAN.md – MD" from `MD-desktop\runtime\electron.exe` (Smart App Control allowed it); closed normally, session saved | pass |
| After `npm start` (run in the worktree, not the main checkout), installed copy opens | pass |
| Both repos' `node_modules\electron\dist` renamed away: installed copy opens | pass |
| Install while MD runs: stops with EPERM "close MD first", marker unchanged | pass |
| Install on a dev build: refused, installed copy unchanged | pass |

  The seven checks from Gianni's list ran against the installed copy through Playwright with a copy of his session (`MD_USER_DATA`), with native save dialogs stubbed in the main process. Scripts: `...\scratchpad\tools\live-checks.mjs`, `probe-installed.mjs`, `probe.mjs`; screenshots in `...\scratchpad\live\shots\` and `...\scratchpad\shots\`.

- Scan done (notebook "Scanning code"): Sonnet at xhigh scanner, then Opus at high and Fable at high checkers, separately. Scan report: `...\scratchpad\scan\report.md`; probes in `...\scratchpad\scan\`, `scan\check-opus\`, `scan\check-fable\` (about 250 MB of stand-in exe copies in `check-fable\` can be deleted).

Not started: the fixes for the scan findings, the re-check, the push, the cleanup.

## 5. Scan findings and the proposed fix plan (waiting on Gianni)

Merged verdicts. Where the checkers differed, the main session applied the notebook's severity rule. Line numbers are in `tools/desktop-install.mjs` at 9db73d9.

Medium:
1. Junction path: `runDirectly` (~298-299) compares `process.argv[1]` as typed with the realpath of `import.meta.url`; through a junction or symlink the script prints nothing, exits 0, installs nothing. Both checkers reproduced it.
2. Empty shortcut target: `shortcutDecision` returns 'create' when the target reads back empty (~133, and `.trim()` at ~152 drops the empty first line), so an existing `MD.lnk` pointing at a non-file item (for example a Store app) would be overwritten silently, against the README promise. Fable rated Medium, Opus Low; Medium because it is silent.
3. Non-ASCII paths: PowerShell output is decoded as UTF-8 but emitted in the OEM code page (~148-152); with an accented Desktop path the shortcut step dies with a raw stack after a successful install, and a non-ASCII repo path makes it say the shortcut "is not MD". Opus Medium, Fable Low; Medium because of the misleading message. Gianni's paths are ASCII.

Low:
4. Interrupted install: the `.md-desktop` marker is written last into `.new` (~220-223) and deleted first from `.old` (rmSync order), and nothing restores a marked `.old` when the install folder is missing, so after a kill the next run refuses the script's own leftover with "was not made by this script"; pre-clean (~184-185) can delete the last working copy if a second failure follows; a half-failed delete of `.old` leaves an unmarked folder that blocks later installs while the log (~247) says "it is removed on the next install".
5. Rollback not fault-tolerant: if a cleanup step in the catch (~235, ~237) throws, the restore (~238-240) never runs and the original error is replaced (Opus case G; Fable saw the same at ~237).
6. Ordinary errors (file in use, disk full) print raw stack traces via ~318.
7. Tests do not pin the matcher rule: three planted bugs survived (no test with a non-Electron target and an md-editor argument, no upper-case tail, no missing `main.cjs`); `install()` and `runDirectly` have no tests.
8. Dev-build regex (~53) only matches `localhost`; a dev build is still caught today because it has no `.vite/renderer`. Opus Low, Fable Medium; Low because the renderer check backs it up (verified: after `npm start`, `.vite/` holds only `build`).
9. Latent: launching the installed runtime without `--appdata` puts the profile in `<install>\app\.dev-userdata`, which the next install deletes. No shortcut does this. Also the note claims tsconfig checks the script, but `allowJs` without `checkJs` does not.
Not a defect: the scanner doubted the "MD is open" stop; the live test with real Electron (working directory outside the install folder) showed it works.

Proposed fix plan (one commit, tests first), not yet approved:
- Compare the real path of the script for `runDirectly`.
- Write the marker right after creating `.new`, delete it last; at start, if the install folder is missing and `.old` is marked, rename it back; put each rollback step in its own try so the restore always runs and the original error is rethrown.
- Plain messages for file-in-use and disk-full; a final line saying what `MD.lnk` now runs.
- PowerShell output as UTF-8 (`[Console]::OutputEncoding=[Text.Encoding]::UTF8;`), `trimEnd()` instead of `trim()`, and an existing `MD.lnk` with an empty target is left alone; a shortcut step failure after a good install prints the manual steps, not a stack.
- Dev-build check also matches `127.0.0.1` and `[::1]`.
- Carry `.old\app\.dev-userdata` into the new `app\` if present.
- Tests for `install()` (built against temp folders with `MD_DESKTOP_DIR`-style paths) and the three matcher gaps; add `// @ts-check` to the script or correct the note; record the live "MD is open" result in the note.
Estimated $4 to $6, plus about $1 for a narrow Opus re-check of the fix commit.

Questions put to Gianni and not yet answered (in his format): "1. Yes or no: approve the fix plan above (one commit on the branch, tests first)? 2. Yes or no: after the fix commit, run a narrow Opus re-check of just that commit (about $1)? Reply like: 1 yes, 2 yes". Default if unanswered: branch stays unpushed, findings open, the shortcut keeps working from the installed copy.

## 6. Open items

- The fix branch is only on this PC. Another machine sees it only after it is pushed to GitHub (needs Gianni's yes; build-workflow stage 7 says the push waits for it).
- Live checks need Windows (PowerShell shortcuts, Smart App Control, Electron window). A Linux machine can do the script fixes and unit tests, but done checks 1 to 6 and Gianni's list must be rerun on this PC after the fixes, then `npm run install:desktop` to put the fixed copy in place.
- Cleanup after the push, each needs Gianni's yes (deletions): the worktree folder `C:\Users\giann\md-editor\.claude\worktrees\fix-desktop-shortcut` (it also causes the 6 format-check failures in the main checkout, because `.oxfmtrc.json` ignore patterns such as `tools/**` are relative to the repo root), and the detached worktree at a2c6288 in `...\scratchpad\wt-a2c6288` (remove with `git worktree remove`).
- Outside this fix, reported to Gianni as separate items: the status bar wraps to two lines when a long path and a "Saved" note share it (already so at e032486, `#status` has no nowrap); SSH to GitHub fails on this PC ("Host key verification failed", github.com missing from `~/.ssh/known_hosts`), and the checkout's remote is HTTPS while the notebook prefers SSH; the notebook was cloned over HTTPS into the scratchpad for the same reason.
- The cloud session's handoff `/mnt/code/_share/work/md-editor/2026-11-14-handoff-web-build-merged.md` (item 0 is this problem) was never read: NAS unreachable from this PC.
- Notebook rules not followed in chat 01 and acknowledged to Gianni: HTTPS clone before trying SSH; the first report lacked [VERIFIED]/[INFERRED] tags and the answer format.

## 7. Exact details

- Repo: `git@github.com:GianniGuava/md-editor.git` (this PC's remote is `https://github.com/GianniGuava/md-editor.git`). Good: e032486. Bad report: a2c6288 (merge of PR #2, branch `feature/web-build`, commits 53a113b, 01400ec, 8f68cc1, 59b5732, f0c30b4, 59765ae, ae4959f).
- Node v24.19.0, npm 11.17.0, Electron 44.8.0, vitest 5.0.5.
- Main process userData: `MD_USER_DATA` env, else `.dev-userdata` in the app folder unless packaged or `--appdata` (`src/main/main.ts:52-60`); with `--appdata` it is `%APPDATA%\MD` (productName "MD").
- Install folder layout: `app\`, `runtime\`, `.md-desktop`. Env override `MD_DESKTOP_DIR`; flag `--no-shortcut`.
- Format config `.oxfmtrc.json` ignores `PLAN.md`, `literature/**`, `tools/**`, `assets/**`, `node_modules/**`, `.vite/**`, `out/**`, `README.md`, `web/dist/**`.
- Sidebar group created for the tag: `project:md-editor`.

## 8. Next step

Get Gianni's answers to the two questions in section 5. On a yes: implement the fix plan on `fix/desktop-shortcut-build` (tests first), run `npm run check` and `npm run test:e2e`, rerun the live checks on this PC, run the re-check if approved, report, then push only on Gianni's yes. Do not redo: the diagnosis, the restore, the first scan, or the verification of the current commits.

## 9. Where to look

- Chat 01 session ID `bbecf166-7de3-4dfc-a763-027da46c45d7`; transcript on this PC: `C:\Users\giann\.claude\projects\C--Users-giann-md-editor\bbecf166-7de3-4dfc-a763-027da46c45d7.jsonl`.
- Spec and plan: `docs/fixes/2026-11-14-blank-window.md` on the branch.
- Notebook notes used: NOTEBOOK.md, tools/build-workflow.md, tools/cost-and-models.md, tools/decision-brief.md, tools/repos.md, tools/handoff-template.md.
- Memory on this PC: `C:\Users\giann\.claude\projects\C--Users-giann-md-editor\memory\` (notebook-location.md and a pointer to this handoff).

## 10. Budget

Not measured exactly. Rough estimate for chat 01: about $25, mostly the main session's long context; the scan about $6 (Sonnet scanner about 204k tokens, Opus checker about 104k, Fable checker about 124k) [INFERRED]. Usage status was never "rejected". Fable used once, as the scan's checker (standing go-ahead).

## Starting prompt for the next chat

> Title this chat "02 md-editor: desktop blank window" and tag it project:md-editor. Continue from the handoff at docs/fixes/2026-11-14-handoff-desktop-blank-window.md on branch fix/desktop-shortcut-build of md-editor (or its copy under /mnt/code/_share/work/md-editor/). Read it first. Then tell me in five lines what you understand the goal, the current state and the next step to be, and wait for my go-ahead. If you need a detail the handoff lacks, search the previous session's transcript it names before asking me.
