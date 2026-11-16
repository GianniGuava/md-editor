# Handoff: md-editor desktop blank window, Windows checks (2026-11-15)

Written 2026-11-15 on claude-dev (the Linux server) at the end of chat "02 md-editor: desktop blank window" (tag `project:md-editor`). Next chat title: **03 md-editor: desktop blank window**, to run on Gianni's Windows 11 PC.

Why this file is in the repo: the PC has no NAS share mapped, so it cannot read `/mnt/code/_share/`. This handoff is committed on the fix branch; a copy is at `/mnt/code/_share/work/md-editor/2026-11-15-handoff-desktop-windows-checks.md` for Linux sessions. The previous handoff, from chat 01 on the PC, is `docs/fixes/2026-11-14-handoff-desktop-blank-window.md` on this branch; read its sections 2, 4 and 7 for the diagnosis, the live-check method and exact paths. Do not redo anything it lists as done.

## 1. Goal and why

Gianni's words (chat 01): "The MD desktop app (Electron, my md-editor repo, git@github.com:GianniGuava/md-editor.git) shows a blank window since I merged pull request #2 into main (merge commit a2c6288, 2026-11-14). Before the merge, main was e032486 and the app worked. Find out why, fix it, and verify the desktop app works. Follow my notebook rules as usual (plan before a nontrivial change, fix on its own branch, the repo's checks and the scan before the push)."

The cause was not PR #2: `npm start` replaces the repo's `.vite/` with a development build that needs a dev server, and the Desktop shortcut ran the repo directly. The fix (`npm run install:desktop`, script `tools/desktop-install.mjs`) installs a checked production copy plus its own Electron runtime in `%LOCALAPPDATA%\MD-desktop` and points `MD.lnk` there. What remains is checking the final code on Windows and installing it.

## 2. Decisions (Gianni's words, with dates)

From chat 01 (2026-11-14), unchanged: "1 yes 2 b  3 a 4 yes" (restore the checkout; guard option B, a separate desktop build folder plus a new shortcut target; spec and plan in `docs/fixes/2026-11-14-blank-window.md`; run the scan) and "1 yes 2 delete 3 b 4 yes" (install folder `%LOCALAPPDATA%\MD-desktop`; no previous copy kept; retarget only `MD.lnk`, leave `MD (2).lnk`; build it).

From chat 02:
- 2026-11-14, on the five-line restatement, the scan-fix plan and an Opus re-check: "1 yes 2 yes 3 yes".
- 2026-11-14, on the three low-severity items the re-check found: "1 a" (fix all three).
- 2026-11-15, on writing this handoff on the fix branch with a starting prompt: "Yes".
- Set aside by Claude, recorded in the fix note: `.oxfmtrc.json` now ignores `docs/fixes/*-handoff-*.md`, because the formatter would collapse the double space inside Gianni's quoted "2 b  3 a".

## 3. Where things stand

Branch `fix/desktop-shortcut-build`, on GitHub, head **cce65e4**. Commits on top of a2c6288:

| Commit | What |
|---|---|
| 7a37d58 | Install the desktop copy outside the repo (chat 01) |
| 9db73d9 | Recognise MD shortcuts from any checkout; clearer dev-build message (chat 01) |
| 994852a | Handoff from chat 01 |
| ff72d40 | Fix the 9 scan findings (chat 02) |
| f216aea | Skip the four chmod-based tests on Windows (chat 02) |
| cce65e4 | Fix the 3 re-check items (chat 02) |
| (next) | This handoff |

What chat 02 changed in `tools/desktop-install.mjs` (details and the finding numbers in `docs/fixes/2026-11-14-blank-window.md`, section "Scan findings and their fixes"):
1. Recognises being started through a junction or symlink (`isEntryScript`, real paths).
2. Leaves an existing `MD.lnk` with an empty target (a Store app, a special folder) alone.
3. PowerShell output switched to UTF-8 without a byte-order mark (`[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false`), parsed line by line (`parseShortcutOutput`); a failure of the shortcut step after a good install prints how to make the shortcut by hand.
4. Marker written first, deleted last (`removeOurs`); a marked `.old` is put back when the install folder is missing; an empty unmarked folder is accepted.
5. Every undo step runs (`runEach`); the original error is reported; a runtime that cannot be moved back is copied back, and the staging folder is never deleted while it holds the only runtime.
6. Plain messages for file in use and disk full (`explain`).
7. Tests for `install()` against temporary folders, with a stand-in for PowerShell, and the matcher gaps (172 unit tests in all; 34 new).
8. Dev-build check also matches `127.0.0.1` and `[::1]`.
9. A profile in `app\.dev-userdata` is carried over; the script has `// @ts-check`.
After a shortcut change the log now prints what `MD.lnk` runs.

Checked on claude-dev, 2026-11-15 [VERIFIED]: `npm run check` passes (typecheck, lint, format, 172 unit tests; 4 of them use `chmod` and run only on Linux/macOS as non-root). The re-check (Opus at high) confirmed items 1, 2 and 4 to 9 fixed; item 3's encoding switch is only checkable on Windows.

Not checked anywhere yet on the final code (cce65e4): everything that needs Windows, listed in section 6.

On the PC (from chat 01, may have changed): the worktree `C:\Users\giann\md-editor\.claude\worktrees\fix-desktop-shortcut` has the branch at 9db73d9 plus the 994852a handoff commit, local. Installed copy `C:\Users\giann\AppData\Local\MD-desktop` from 9db73d9, Electron 44.8.0; `MD.lnk` points there; `MD (2).lnk` still points at the main checkout's runtime.

## 4. Open items

- The Windows checks in section 6, then `npm run install:desktop` from the updated worktree.
- After that, Gianni decides how the branch reaches main (open a PR or merge himself). The push rule allows pushing the branch; merging into main is his.
- Cleanup, each needs Gianni's yes (deletions): the PC worktree folder above (it also makes the main checkout's format check report 6 files, because `.oxfmtrc.json` patterns are relative to the repo root), the detached worktree `...\scratchpad\wt-a2c6288` from chat 01 (`git worktree remove`), and about 250 MB of stand-in exe copies in chat 01's `scratchpad\scan\check-fable\`. On claude-dev: worktree `/var/tmp/md-desktop-fix` (clean, all pushed).
- Reported separately, not part of this fix: the status bar wraps to two lines when a long path and "Saved" share it (`#status` has no nowrap, already so at e032486); SSH to GitHub fails on the PC ("Host key verification failed"; github.com missing from `~/.ssh/known_hosts`) and its checkout's remote is HTTPS while the notebook prefers SSH.
- The claude-dev checkout `/mnt/code/md-editor` is still on `feature/web-build`, whose remote branch is gone; left as it is.
- The web build's handoff `/mnt/code/_share/work/md-editor/2026-11-14-handoff-web-build-merged.md` (its item 0 is this problem) stays the entry point for the phone build.

## 5. Exact details

- Repo `git@github.com:GianniGuava/md-editor.git` (PC remote `https://github.com/GianniGuava/md-editor.git`). Good main e032486; PR #2 merge a2c6288.
- PC tools (chat 01): Node v24.19.0, npm 11.17.0, Electron 44.8.0, vitest 5.0.5. claude-dev: Node v24.22.2, npm 11.19.1.
- Install layout: `app\`, `runtime\`, `.md-desktop`. Env override `MD_DESKTOP_DIR`; flag `--no-shortcut`. Profile with `--appdata`: `%APPDATA%\MD`; `MD_USER_DATA` overrides (`src/main/main.ts:52-60`).
- If `node_modules\electron\dist\electron.exe` is missing after an install: `node node_modules/electron/install.js` (npm 11 skips install scripts not in `allowScripts`).

## 6. Next step (on the PC)

1. In the worktree: `git fetch origin` then `git merge --ff-only origin/fix/desktop-shortcut-build` (should land on the commit that adds this file). Then `npm install`, and check `node_modules\electron\dist\electron.exe` exists.
2. `npm run check` (expect 168 run, 4 skipped on Windows) and `npm run test:e2e`.
3. Close MD, run `npm run install:desktop`. Expect "runtime kept (same version)" and a final line saying what `MD.lnk` now runs.
4. Rerun done checks 1 to 6 and Gianni's list (check 8) from `docs/fixes/2026-11-14-blank-window.md` against the installed copy, the way chat 01 did (handoff 2026-11-14, section 4: Playwright with a copy of the session in `MD_USER_DATA`, plus the real `MD.lnk` once). Chat 01's probe scripts were in its scratchpad and may be gone.
5. Windows-only checks the Linux tests could not cover:
   - Non-ASCII path: make `C:\Temp\Café\` with a shortcut in it and read it with the same PowerShell query the script uses (through `node -e` and `execFileSync`), and confirm the path comes back intact. Also run the install with `MD_DESKTOP_DIR=C:\Temp\Café\MD-desktop --no-shortcut` and confirm it installs and starts.
   - Started through a junction: `mklink /J C:\Temp\mdlink <worktree>` then `node C:\Temp\mdlink\tools\desktop-install.mjs --no-shortcut` with `MD_DESKTOP_DIR` set to a test folder; it must install, not exit silently.
   - Empty-target shortcut: a test `MD.lnk` is hard to make with an empty target; acceptable to rely on the unit test, say so.
6. Report each check pass or fail, then ask Gianni about the merge and the cleanup.

Do not redo: the diagnosis, the scan, the re-check, the Linux checks.

## 7. Where to look

- Chat 02: session `2d17cc06-cb28-5e0b-8d24-d0cabc3cabdd` (cloud id `session_01FMij2BJZWzgYMGvumwfwuq`), transcript on claude-dev `/home/gianni/.claude-b/projects/-mnt-code/2d17cc06-cb28-5e0b-8d24-d0cabc3cabdd.jsonl`.
- Chat 01: session `bbecf166-7de3-4dfc-a763-027da46c45d7`, transcript on the PC `C:\Users\giann\.claude\projects\C--Users-giann-md-editor\bbecf166-7de3-4dfc-a763-027da46c45d7.jsonl`.
- Fix note (spec, plan, changes, scan fixes, re-check): `docs/fixes/2026-11-14-blank-window.md`.
- Notebook notes: NOTEBOOK.md, tools/build-workflow.md, tools/cost-and-models.md, tools/handoff-template.md.

## 8. Budget

Chat 02, rough [INFERRED]: about $8 to $10, of which the Opus re-check was about $1.50 (116,505 tokens) and the rest the main session. Chat 01 was about $25 plus about $6 for its scan. Usage status in chat 02 was "allowed" throughout. No Fable used in chat 02.

## Starting prompt for the next chat (on the PC)

> Title this chat "03 md-editor: desktop blank window" and tag it project:md-editor. In C:\Users\giann\md-editor\.claude\worktrees\fix-desktop-shortcut, run git fetch origin and git merge --ff-only origin/fix/desktop-shortcut-build, then continue from the handoff at docs/fixes/2026-11-15-handoff-desktop-windows-checks.md. Read it first. Then tell me in five lines what you understand the goal, the current state and the next step to be, and wait for my go-ahead. If you need a detail the handoff lacks, search the previous session's transcript it names before asking me.
