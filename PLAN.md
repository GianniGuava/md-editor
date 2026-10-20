# MD — Markdown editor for Windows: build outline and design decision register

Status: **Review items R-1 to R-16 were decided by the user on 2026-10-16 (see §12).** Human-research gaps H-1 to H-15 remain open. The CITED implications still stand as my readings of the sources and may be challenged. Every decision below carries one of these tags:

| Tag | Meaning |
|---|---|
| **CITED** | Backed by a peer-reviewed source verified on a live page (details in `literature/`). The implication drawn from the source is mine and still needs your review. |
| **STANDARD** | Backed by a published standard (W3C WCAG 2.2, CSS Media Queries 5). Not peer-reviewed. |
| **VENDOR** | Backed by official tool documentation (Electron, Pandoc, chokidar, Node). |
| **ENGINEERING** | A technical choice with no academic literature to cite. Reasoning given; review required. |
| **REVIEW (R-n)** | A choice that rests on an uncited assumption, or where the evidence is mixed. Listed in §9 with alternatives. |
| **HUMAN RESEARCH (H-n)** | The research agents could not find an academic source. Listed in §10. |

Decisions are numbered **D-n** in §8. Review items **R-n** in §9. Research gaps **H-n** in §10. Citation details, DOIs, verification notes and known weaknesses of each source are in:

- `literature/typography-readability.md`
- `literature/interaction-design.md`
- `literature/state-watching-export-colour.md`

Verified palette tool: `tools/contrast_check.py` (implements the WCAG 2.2 relative-luminance and contrast-ratio formulas; run it after any colour change).

---

## 1. What is being built

A desktop Markdown editor for Windows 11 with:

1. Tabbed editing of multiple files.
2. Watching open files on disk and reloading when another program changes them.
3. Themes (light, dark, follow-system), monochrome plus one blue accent, WCAG 2.2 AA throughout.
4. Session state that survives restarts and crashes: open tabs, order, active tab, cursor, scroll, selection, pane split, window bounds, and unsaved text.
5. Export to HTML, PDF and DOCX (plus anything else Pandoc can write, when Pandoc is installed).
6. An "MD" logo: black Garamond on white.

Out of scope for v1 (listed so they are not assumed): cloud sync, collaborative editing, plugins, spell-check, a WYSIWYG mode.

---

## 2. Technology stack

| Component | Choice | Tag | Why |
|---|---|---|---|
| Shell | **Electron** (TypeScript, Vite, electron-forge) | ENGINEERING + R-1 | Gives PDF export with no external dependency through `webContents.printToPDF` (VENDOR: Electron docs). Node 24 and npm 11 are already on this machine. Alternative: Tauri (Rust, smaller binary, uses the `notify` crate for watching). |
| Editor component | **CodeMirror 6** | ENGINEERING + R-2 | Accessible text editing (real DOM, screen-reader friendly), Markdown language mode, linear undo history built in. Alternative: Monaco (heavier, code-oriented). |
| Markdown parser | **markdown-it** + DOMPurify sanitiser | ENGINEERING | CommonMark + GFM tables/task lists; sanitising is required because the preview renders arbitrary HTML from files on disk. |
| File watching | **chokidar** | VENDOR | Documented handling of Windows atomic-save patterns (`atomic`, `awaitWriteFinish`), native recursive watching on Windows, polling fallback for network drives. Node's bare `fs.watch` is documented as "not 100% consistent across platforms." |
| Session store | **electron-store** style JSON in `%APPDATA%\MD\` with atomic writes | ENGINEERING | See step 6. |
| DOCX and other formats | **Pandoc** (external, user-installed) | VENDOR | Pandoc 3.12.1 writes `docx`, `odt`, `epub`, `latex`, etc. Not installed on this machine today; the app must detect it and show install guidance. |
| PDF | **Electron printToPDF** of the preview pane, Pandoc as optional alternative | VENDOR | Avoids requiring a LaTeX engine (Pandoc's PDF default), which is also absent on this machine. |
| Packaging | electron-builder, NSIS installer, `.ico` from the logo | ENGINEERING | |
| Tests | Vitest (unit), Playwright for Electron (end-to-end), axe-core (accessibility), `tools/contrast_check.py` (palette) | ENGINEERING | |

---

## 3. Build steps — how each one will be done

### Step 1 — Scaffold and security baseline
1. Create the project with electron-forge + Vite + TypeScript: `main/` (Node process: windows, files, watching, session, export), `preload/` (narrow IPC bridge), `renderer/` (UI).
2. Context isolation on, node integration off in the renderer, a strict Content-Security-Policy. The renderer never touches the filesystem directly; every file operation goes through typed IPC.
3. Commit the colour tokens (§7) as CSS custom properties from day one so no hard-coded colour ever enters the code.

### Step 2 — Editor core (single document)
1. Mount CodeMirror 6 with the Markdown language, line wrapping, and a linear undo history (D-20).
2. Render the preview with markdown-it, sanitised with DOMPurify, into a second pane. Re-render is debounced (~100 ms) and diffed so typing stays smooth (ENGINEERING).
3. Layout: editor left, preview right, draggable splitter, with "editor only", "preview only" and "split" modes (D-14, R-9).
4. Typography defaults (D-1 to D-6): sans-serif UI and body font (Segoe UI on Windows), 18 px default text size with Ctrl+plus/minus zoom, preview measure capped at 70 characters, line-height 1.5, subtle switchable markup colouring.
5. Scroll sync between panes, best-effort by source line, switchable off (H-10).

### Step 3 — Tabs
1. Document model: each tab holds `{ id, path | null, text, dirty, cursor, scroll, selection, undoHistory, lastDiskHash }`.
2. Tab bar across the top of the window (D-8, R-5). Each tab shows the file name, a dirty marker that is not colour-only (a dot plus a "modified" tooltip and screen-reader text; STANDARD WCAG 1.4.1), and a close control.
3. Behaviours: Ctrl+T new, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab cycle, Ctrl+1..9 jump, middle-click close, drag to reorder, Ctrl+Shift+T reopen last closed (restored from the session store, D-23).
4. Overflow: when tabs no longer fit, the bar scrolls horizontally and a "list all tabs" button appears; titles never shrink below a legible minimum width (D-9, CITED Dubroy & Balakrishnan 2010: heavy users complained of unreadable titles once the bar scrolls at roughly 9–13 tabs).
5. Closing a dirty tab shows the one confirmation dialog this app has: Save / Don't save / Cancel (D-21, confirmed R-13).
6. Hold-Alt shortcut overlay in v1 (decided R-7): holding Alt for 300 ms draws each command's shortcut next to it on the toolbar and tab bar (CITED Malacria et al. 2013, ExposeHK). A plain tap of Alt still focuses the menu bar as Windows expects; the 300 ms threshold is an ENGINEERING choice to be tuned in testing.

### Step 4 — Watch and reload files
1. On open, the main process registers the file with chokidar (`atomic: true`, `awaitWriteFinish: { stabilityThreshold: 200 }`, polling fallback when the path is a UNC or mapped network drive, VENDOR).
2. The app's own saves are recognised by comparing the on-disk content hash with `lastDiskHash`, so self-writes do not trigger a reload (ENGINEERING).
3. Policy (D-18, R-11):
   - Buffer clean → reload silently; show a transient status-bar note "Reloaded from disk 10:42:07" (CITED Dourish & Bellotti 1992: passive awareness over active locks).
   - Buffer dirty → do not interrupt; show a non-modal banner above the editor: "This file changed on disk. [Reload] [Keep mine] [Show differences]" (CITED Brun et al. 2011: detect conflicts proactively and warn without interrupting; Sarma et al. 2003: surface with a severity cue).
   - File deleted or renamed → banner "File no longer exists on disk. [Save as…] [Close]"; buffer is kept.
4. Watchers are released when a tab closes. Watcher errors (EPERM when a directory is deleted, VENDOR Node caveats) are logged and surfaced as a banner, never a crash.

### Step 5 — Themes
1. All colours live as CSS custom properties on `:root[data-theme]`. Four choices ship: **Light (default)**, **Dark**, **High contrast** (AAA 7:1 text, decided R-6), and **System** (follows `nativeTheme` in Electron, which mirrors `prefers-color-scheme`, STANDARD Media Queries 5 §12.5; System picks Light or Dark).
2. Light is the default (D-10, CITED: four Ergonomics / Applied Ergonomics studies find positive polarity better for proofreading at all ages and lighting levels).
3. Each theme is a JSON file of tokens; `tools/contrast_check.py` runs in CI against every theme and fails the build if any pair drops below the AA ratios in §7.
4. Non-colour cues for every state: focus ring 2 px solid plus 2 px offset (STANDARD 2.4.7, and 2.4.13 adopted voluntarily, D-13), disabled controls get reduced contrast plus `aria-disabled`, errors and destructive actions get an icon and text plus the single permitted red token `danger` (D-12, decided R-8). Red never appears anywhere else.
5. `prefers-reduced-motion` honoured: no animated transitions when set (STANDARD, Media Queries 5).

### Step 6 — Session state across restarts
1. A single `session.json` in `%APPDATA%\MD\`, written atomically (write to temp, fsync, rename) so a crash mid-write never corrupts it (ENGINEERING).
2. Contents (D-22, CITED Czerwinski et al. 2004; Mark et al. 2005; Iqbal & Horvitz 2007; Trafton et al. 2003): schema version; window bounds and maximised state; theme; pane mode and splitter ratio; tabs in order; active tab; per tab: path, cursor, selection, scroll, dirty flag, and, if dirty, a pointer to a draft file `drafts/<id>.md`; the last 10 closed tabs for reopen.
3. Write triggers: debounced 500 ms after any tab, cursor, scroll or text change; on window blur; on quit. Draft text is written on the same debounce so a crash loses at most half a second of typing (D-23, R-12, CITED Jones & Martin 2003: failing to save is an attention-driven human error, so the system should own persistence; Iqbal & Horvitz 2007: users asked for autosave on task switch).
4. Restore on launch: tabs reopen in order; a tab whose file is missing becomes an "orphan" tab showing the draft or an explanation; a dirty tab shows its draft and a "recovered unsaved changes" banner; cursor and scroll are restored after the editor has laid out.
5. Explicit **Save** (Ctrl+S) is still what writes to the user's file. Automatic writing to the user's own file is off by default and offered as a setting (R-12).
6. Schema migrations: `version` field, migrate forward, never silently drop unknown keys.

### Step 7 — Export
1. **HTML** (built in): self-contained single file, inline CSS from the current theme or a print-neutral light theme, images inlined as data URIs when under a size cap, optional table of contents.
2. **PDF** (built in): render the document in a hidden window with a print stylesheet (light colours regardless of theme, serifless body, page margins), then `webContents.printToPDF({ printBackground: true, pageSize: 'A4' | 'Letter', generateDocumentOutline: true })` (VENDOR). Page size follows the OS locale by default and is user-selectable.
3. **DOCX / ODT / EPUB / LaTeX / RTF / others** (external): shell out to Pandoc with `-f gfm -t <format>`, a bundled `reference.docx` that mirrors the app's heading hierarchy, and `--resource-path` set to the file's folder for images (VENDOR Pandoc manual). If Pandoc is not found on PATH, the export dialog explains and offers the install command (`winget install JohnMacFarlane.Pandoc`); it never silently fails.
4. **PDF via Pandoc** is offered as an alternative in the same dialog when a supported engine is detected (`typst`, `weasyprint`, `wkhtmltopdf`, `xelatex`); otherwise it is hidden (VENDOR).
5. Export dialog: a list with the format name, a one-line description and the dependency status, a destination picker, and a single primary button. Shortcuts shown next to the commands in the File menu (D-16).

### Step 8 — Logo and packaging
1. Logo source: `assets/logo.svg` (already drafted): white square, black "MD" in EB Garamond (D-24). EB Garamond is bundled under the SIL Open Font License 1.1, which allows bundling with software (VENDOR: Google Fonts OFL file). Microsoft's Garamond is a proprietary Monotype font that ships with Office, not Windows, is not installed on this machine, and may not be redistributed or embedded without a Monotype licence (VENDOR: Microsoft typography docs). The logo is exempt from contrast rules anyway (STANDARD 1.4.3 logotype exception), but black on white is 21:1.
2. Convert the text to outlines so the logo does not depend on installed fonts: Inkscape "Object to Path" or `fontTools` + `svgpathtools`. Rasterise to 16, 24, 32, 48, 64, 128, 256 px PNGs; build `app.ico` with `png-to-ico`. Use the SVG as the in-app About logo.
3. Package with electron-builder (NSIS, per-user install, no admin), code signing deferred (R-14).

### Step 9 — Accessibility and quality gates
1. Automated: contrast script on every theme; axe-core on every screen; keyboard-only Playwright run through every feature; unit tests for the session store migrations and the reload policy.
2. Manual: NVDA walkthrough of tabs, banners and dialogs; 200 % Windows display scaling; high-contrast mode (Windows forced colours) respected via `forced-colors` media query.
3. Guideline compliance is necessary, not sufficient (CITED Power et al. 2012: only 50 % of problems blind users hit were covered by WCAG 2.0 criteria), so a short user test with at least one keyboard-only user and one screen-reader user is a release gate (R-15).

### Step 10 — Review gates before any code
Nothing in steps 2–9 starts until §9 (review items) has your answers. Steps 1 (scaffold) and 8.1 (logo file) are already decided enough to begin.

---

## 4. Screen layout

```
┌───────────────────────────────────────────────────────────────┐
│ File  Edit  View  Export  Help                      (menu bar) │
├───────────────────────────────────────────────────────────────┤
│ [ Notes.md ● ] [ README.md ] [ todo.md ]  ▸ [≡]   (tab bar)   │
├───────────────────────────────────────────────────────────────┤
│ ⟲ Undo  ⟳ Redo │ B Bold  I Italic  H Heading  ⋯ │ ▣ Split ▾  │
├───────────────────────────────┬───────────────────────────────┤
│                               │                               │
│   editor (CodeMirror)         │   preview (sanitised HTML)    │
│                               │                               │
├───────────────────────────────┴───────────────────────────────┤
│ Ln 12, Col 4 · 1,204 words · Reloaded from disk 10:42  (status)│
└───────────────────────────────────────────────────────────────┘
```

Toolbar buttons are 32 × 32 px with 8 px gaps (D-7), icons plus visible text labels by default (D-15), tooltips that include the shortcut (D-16). Banner messages (file changed, recovered draft) appear between the toolbar and the editor, never as modal dialogs (D-18, D-21).

---

## 5. Keyboard shortcuts (shown in every menu item and tooltip, D-16)

| Action | Shortcut |
|---|---|
| New tab / Open / Save / Save as | Ctrl+T / Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Close tab / Reopen closed tab | Ctrl+W / Ctrl+Shift+T |
| Next / previous tab, jump to tab n | Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1…9 |
| Undo / Redo | Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) |
| Bold / Italic / Link / Code | Ctrl+B / Ctrl+I / Ctrl+K / Ctrl+` |
| Toggle preview / editor / split | Ctrl+Shift+P / Ctrl+Shift+E / Ctrl+\ |
| Export… | Ctrl+E |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Theme switcher | Ctrl+Shift+L |
| Show all shortcuts overlay (hold 300 ms) | Alt (v1, decided R-7) |

Shortcut choices follow Windows conventions; the overlay idea is from ExposeHK (CITED Malacria et al. 2013).

---

## 6. Typography

| Setting | Default | Tag |
|---|---|---|
| UI and preview font | Segoe UI (system sans-serif), fallback `system-ui, sans-serif` | D-5 CITED |
| Editor font | Cascadia Mono (ships with Windows 11), user-switchable to proportional | D-6 REVIEW R-4 + H-7 |
| Base text size | 18 px, zoomable 12–32 px, remembered per session | D-1 CITED + R-3 |
| Preview measure | `max-width: 70ch`, left-aligned, never justified | D-2, D-4 CITED |
| Line height | 1.5 | D-3 STANDARD + R-3 |
| Paragraph spacing | 1 em | ENGINEERING |
| Markup colouring in editor | Subtle: headings bold, links blue, code on `surface`; everything else text colour. Switchable off. | D-11 CITED (mixed) |
| Logo | EB Garamond, logo only | D-24 CITED |

---

## 7. Colour palette (verified with `tools/contrast_check.py`, all pairs pass WCAG 2.2 AA)

Monochrome greys plus one blue hue, plus one red token (`danger`) reserved for destructive buttons and error banners only (decided R-8). No green or yellow anywhere. A High-contrast theme at AAA was added (decided R-6).

### Light theme (default)

| Token | Hex | Used for | Checked against | Ratio | Needs |
|---|---|---|---|---|---|
| `bg` | `#FFFFFF` | page, editor, active tab | — | — | — |
| `surface` | `#F2F2F2` | panels, code blocks, banners | — | — | — |
| `surface2` | `#E6E6E6` | toolbar, inactive tabs | — | — | — |
| `text` | `#1A1A1A` | body text | bg / surface / surface2 | 17.4 / 15.6 / 13.9 | 4.5 |
| `text2` | `#595959` | secondary text, status bar | bg / surface | 7.0 / 6.3 | 4.5 |
| `border` | `#767676` | input borders, splitter | bg / surface | 4.5 / 4.1 | 3.0 |
| `accent` | `#0B57D0` | primary button, links, active-tab underline | bg (as text) / bg (as component) | 6.4 / 6.4 | 4.5 / 3.0 |
| `on-accent` | `#FFFFFF` | text on accent | accent | 6.4 | 4.5 |
| `focus` | `#0B57D0` | focus ring | bg / surface | 6.4 / 5.7 | 3.0 |
| `selection` | `#CCE0FF` | text selection | text on it | 13.0 | 4.5 |
| `disabled` | `#8C8C8C` | disabled labels (exempt from 1.4.3 but kept ≥3:1) | bg | 3.4 | — |
| `danger` | `#B3261E` | destructive buttons, error banners only | bg / surface | 6.5 / 5.8 | 4.5 |

### Dark theme

| Token | Hex | Checked against | Ratio | Needs |
|---|---|---|---|---|
| `bg` | `#121212` | — | — | — |
| `surface` | `#1E1E1E` | — | — | — |
| `surface2` | `#2A2A2A` | — | — | — |
| `text` | `#E6E6E6` | bg / surface / surface2 | 15.0 / 13.4 / 11.5 | 4.5 |
| `text2` | `#A6A6A6` | bg / surface | 7.7 / 6.9 | 4.5 |
| `border` | `#6E6E6E` | bg / surface | 3.7 / 3.3 | 3.0 |
| `accent` (buttons) | `#2D6FE0` | bg (component) | 4.0 | 3.0 |
| `on-accent` | `#FFFFFF` | accent | 4.7 | 4.5 |
| `link` / `focus` | `#8AB4F8` | bg / surface | 8.9 / 7.9 | 4.5 / 3.0 |
| `selection` | `#1F3A6B` | text on it | 9.0 | 4.5 |
| `disabled` | `#7A7A7A` | bg | 4.4 | — |
| `danger` | `#F2B8B5` | bg / surface | 11.0 / 9.8 | 4.5 |

### High-contrast theme (AAA text, 7:1; decided R-6)

| Token | Hex | Checked against | Ratio | Needs |
|---|---|---|---|---|
| `bg` / `surface` / `surface2` | `#FFFFFF` / `#F2F2F2` / `#E6E6E6` | — | — | — |
| `text` | `#000000` | bg / surface / surface2 | 21.0 / 18.8 / 16.8 | 7.0 |
| `text2` | `#3D3D3D` | bg / surface | 10.9 / 9.7 | 7.0 |
| `border` | `#595959` | bg / surface | 7.0 / 6.3 | 3.0 |
| `accent` / `link` / `focus` | `#0041A8` | bg (text) / surface | 9.1 / 8.1 | 7.0 / 3.0 |
| `on-accent` | `#FFFFFF` | accent | 9.1 | 7.0 |
| `selection` | `#CCE0FF` | text on it | 15.7 | 7.0 |
| `disabled` | `#767676` | bg | 4.5 | — |
| `danger` | `#8F0000` | bg / surface | 9.7 / 8.7 | 7.0 |

Rules applied (STANDARD WCAG 2.2): text ≥ 4.5:1 (1.4.3); UI component boundaries and focus indicators ≥ 3:1 against adjacent colours (1.4.11); colour never the sole carrier of meaning (1.4.1); focus visible on every control (2.4.7) with ≥ 2 px perimeter and ≥ 3:1 change (2.4.13, AAA, adopted voluntarily, D-13); targets ≥ 24 × 24 px (2.5.8); no content loss at 1.5 line height / 2× paragraph spacing (1.4.12).

Blue choice: a link-blue on white has no measured reading penalty and successfully draws attention (CITED Gagl 2016); the blue–yellow axis survives red–green colour-vision deficiency (CITED Brettel, Viénot & Mollon 1997; Viénot et al. 1999); the foveal S-cone gap is real (CITED Curcio et al. 1991) but reading studies show no penalty at normal sizes with adequate luminance contrast (CITED Legge & Rubin 1986), so the dark theme uses a lighter, less saturated blue for text rather than saturated blue on black (D-12). Palette colours were chosen against the compliant set first and then checked, rather than adjusted after the fact (CITED Sandnes 2016).

Note on the 4.5:1 figure itself: the W3C rationale (ISO 9241-3's 3:1 times a 1.5× contrast-sensitivity loss at 20/40 acuity) rests on an ARVO abstract (Arditi & Faye 2004) that the agents could not locate and on a withdrawn ISO standard (H-11). The ratios are used here as a normative standard, not as a peer-reviewed claim. APCA is noted as a non-normative alternative that WCAG 3.0 has not adopted (H-12).

---

## 8. Design decision register

Each row: what was decided, the evidence tag, the source, and what the source actually supports. Full citations in `literature/`.

### Typography

| ID | Decision | Tag | Source and what it supports |
|---|---|---|---|
| D-1 | Default text size 18 px, zoomable | CITED + R-3 | Rello, Pielot & Marcos 2016 (CHI): readability and comprehension rose continuously up to 18 pt, recommend ≥18 pt. Legge & Bigelow 2011 (J. Vision): 16 px sits near the critical print size, a floor not a comfort setting. Bernard et al. 2001 (CHI EA): older adults read 14 pt better than 12 pt. 18 px (13.5 pt) is a compromise between the evidence (larger) and screen real estate; see R-3. |
| D-2 | Preview measure capped at 70 characters per line | CITED | Dyson & Haselgrove 2001 (IJHCS): 55 cpl gave better comprehension than 100. Dyson 2004 (BIT review): speed is flat in the middle range; readers prefer ~55 and dislike very long lines. Evidence is mixed on speed (longer is faster) vs comprehension/preference (shorter is better); 70 sits in the overlap. |
| D-3 | Line height 1.5 | STANDARD + R-3 | WCAG 1.4.12 requires content to survive 1.5× line height; Ling & van Schaik 2007 (Displays): wider spacing improved visual search. No study identifies 1.5 as optimal; Rello 2016 found spacing marginal and extremes worse; Chaparro et al. 2004 (not peer-reviewed) found leading affects preference only. |
| D-4 | Left-aligned text, never justified | CITED | Ling & van Schaik 2007: left-aligned beat justified on search performance although justified was preferred. |
| D-5 | Sans-serif for UI and preview; Garamond only in the logo | CITED | Rello & Baeza-Yates 2016 (ACM TACCESS, n=97 incl. 48 dyslexic): sans-serif, monospaced and roman read significantly better than serif, proportional and italic. Arditi & Cho 2005 (Vision Research) and Ali et al. 2013 find no serif penalty for typical readers, so the serif ban is for inclusion, not for the average reader. Wallace et al. 2022 (TOCHI): EB Garamond had the highest mean speed among 16 fonts but was fastest for only ~48 % of readers, so it is a fine display face and a poor universal body face. |
| D-6 | Editor pane in monospace by default, proportional selectable | REVIEW R-4 + H-7 | Arditi, Knoblauch & Grunwald 1990 (JOSA A) and Mansfield, Legge & Bane 1996 (IOVS): proportional reads ~5 % faster at comfortable sizes; monospace is more robust near acuity limits. No study on editing tasks (table and code alignment). Monospace chosen for alignment; evidence leans slightly the other way for pure reading. |
| D-11 | Subtle, switchable markup colouring in the editor | CITED (mixed) | Hannebauer et al. 2018 (EMSE, n=390): no comprehension benefit from syntax highlighting. Sarkar 2015 (PPIG, n=10): faster task completion, benefit shrinks with experience. Beelders & du Plessis 2016 (JEMR): no significant eye-movement difference, subjective preference for colour. So: offer it for preference and novices, keep it subtle, do not claim a comprehension gain. |

### Colour and themes

| ID | Decision | Tag | Source and what it supports |
|---|---|---|---|
| D-10 | Light theme is the default; dark is opt-in; "System" available | CITED + STANDARD | Buchner & Baumgartner 2007; Piepenbrock, Mayr, Mund & Buchner 2013; Piepenbrock, Mayr & Buchner 2014 (all Ergonomics); Dobres, Chahine & Reimer 2017 (Applied Ergonomics): positive polarity is better for proofreading and acuity at all ages and lighting levels, and negative polarity in a dark room was the worst condition. "System" follows `prefers-color-scheme` (Media Queries 5 WD, §12.5). |
| D-12 | Monochrome plus one blue; dark theme uses lighter blue for text | CITED | Gagl 2016 (PeerJ); Brettel et al. 1997; Viénot et al. 1999; Curcio et al. 1991; Legge & Rubin 1986. See §7. |
| D-13 | Focus ring 2 px solid accent with 2 px offset on every control | STANDARD | WCAG 2.4.7 (AA) plus 2.4.13 (AAA) adopted voluntarily. No peer-reviewed focus-indicator experiment found (H-9). |
| D-17 | Themes offered as a satisfaction feature, not claimed to improve performance | CITED | Monk & Blom 2007 (BIT); Blom & Monk 2003 (HCI): appearance personalisation yields ownership and attachment. No evidence of a performance effect. |
| D-25 | Palette verified by script against WCAG ratios in CI | STANDARD + CITED | WCAG 1.4.3 / 1.4.11 formulas; Sandnes 2016: designers reason poorly about the WCAG contrast space, so check mechanically and early. |

### Interaction

| ID | Decision | Tag | Source and what it supports |
|---|---|---|---|
| D-7 | Toolbar and tab controls 32 × 32 px minimum, 8 px gaps | STANDARD + CITED + H-1/H-4 | WCAG 2.5.8: ≥ 24 × 24 px. Fitts 1954; MacKenzie 1992: time to hit a target grows as it shrinks. Grossman & Balakrishnan 2005; Chapuis & Dragicevic 2011: small targets carry a disproportionate cost. No peer-reviewed minimum pixel size for mouse targets exists (H-1); the 8 px grid is convention only (H-4). 32 px is a judgement above the 24 px floor. |
| D-8 | Tabs across the top of the window | REVIEW R-5 + H-3 | Tabs as the multi-document model: Dubroy & Balakrishnan 2010 (CHI): 20 of 21 users preferred tabs to windows; Huang & White 2010: tab switching is the norm. Placement (top vs side) has no academic evidence; top follows Windows convention. |
| D-9 | Tab bar scrolls with a "list all tabs" button; titles keep a minimum width | CITED | Dubroy & Balakrishnan 2010: bar starts scrolling at ~9–13 tabs on a 1280 px display and heavy users complained of unreadable titles and duplicates; Chang et al. 2021 (CHI): users keep tabs as reminders and fear losing them, so never auto-close. No numeric performance threshold exists (H-2). |
| D-14 | Split editor/preview by default, with editor-only and preview-only modes | REVIEW R-9 + H-6 | Knauff & Nejasmic 2014 (PLoS ONE) is the only comparison (Word vs LaTeX, compile-and-view): markup users were slower and more error-prone, which argues for making the rendered result continuously visible. No study compares live split-pane preview with WYSIWYG or toggle. |
| D-15 | Toolbar icons carry visible text labels by default (labels can be hidden) | CITED | Wiedenbeck 1999 (BIT): icon-only was markedly worse for novices and icon+label rated easiest throughout. Kacmar & Carey 1991 (BIT): text+icon gave fewest wrong selections with no speed penalty. |
| D-16 | Shortcuts printed in every menu item and tooltip; optional hold-Alt overlay | CITED | Lane et al. 2005 (IJHCI, n=251): experienced users rarely migrate to shortcuts on their own although shortcuts are fastest. Peres et al. 2004 (HFES): adoption is driven by exposure. Grossman et al. 2007 (CHI): small menu-feedback changes accelerate hotkey learning. Malacria et al. 2013 (CHI): an overlay showing hotkeys on commands increased and accelerated use. |
| D-19 | Related controls grouped by spacing; separators used sparingly | CITED | Wertheimer 1923 / Wagemans et al. 2012 (Psych. Bulletin): proximity grouping is robust. Niemelä & Saarinen 2000 (Human Factors): spatially grouped icons are found faster. Exact pixel values are convention (H-4). |
| D-20 | Linear undo (CodeMirror history), unlimited within a session, persisted per tab for the session | CITED + R-10 | Abowd & Dix 1992 (Interacting with Computers): undo is a user intention to support predictably. Berlage 1994 (TOCHI) documents the limits of linear undo; Yoon & Myers 2015 (ICSE) found selective undo ~2× faster for programmers' backtracking. No prose-editor study; linear chosen for predictability (R-10). |
| D-21 | No routine confirmation dialogs. One modal only: closing or quitting with unsaved changes (Save / Don't save / Cancel). Everything else is undoable or recoverable from drafts. | CITED by analogy + R-13 | Böhme & Köpsell 2010 (CHI, ~80k users); Egelman et al. 2008; Anderson et al. 2015; Vance et al. 2018 (MISQ); Akhawe & Felt 2013 (USENIX): routine dialogs train click-through; interruptive warnings work only when rare and distinctive. All are security/consent studies, so the editor application is an inference. |

### State, files, export

| ID | Decision | Tag | Source and what it supports |
|---|---|---|---|
| D-18 | Watch policy: silent reload when clean with a status note; non-modal banner when dirty; banner on delete/rename | CITED + R-11 + H-8 | Dourish & Bellotti 1992 (CSCW): passive awareness over active locking. Brun et al. 2011 (FSE): proactive, non-interrupting conflict warnings. Sarma et al. 2003 (ICSE): unobtrusive surfacing with severity. Gutwin & Greenberg 2002: show what changed and when. The exact clean/dirty policy is a vendor convention (VS Code, Sublime), not cited. |
| D-22 | Restore tabs, order, active tab, cursor, selection, scroll, split, window bounds | CITED | Czerwinski, Horvitz & Wilhite 2004 (CHI): returned-to tasks involve more documents and are harder to re-enter; software should "preserve and recreate" task state. Mark et al. 2005 (CHI): 77 % of interrupted work is resumed the same day after several intervening activities. Iqbal & Horvitz 2007 (CHI): ~16.5 min resumption phase, ~3 windows suspended per diversion. Trafton et al. 2003 (IJHCS): resumption lag is a measurable cost of lost context. |
| D-23 | Unsaved text autosaved to a drafts folder every 500 ms and on blur/quit; explicit Save still writes the real file; "autosave to file" off by default | CITED + R-12 + H-5 | Jones & Martin 2003 (Applied Cognitive Psychology): failing to save is an attention-related human error. Iqbal & Horvitz 2007: users wanted autosave on switch. No study measures lost-work reduction from autosave (H-5). |
| D-24 | Logo: EB Garamond "MD", black on white, text converted to outlines | VENDOR + CITED | OFL 1.1 permits bundling; Microsoft Garamond is proprietary and absent here. Paterson & Tinker 1932 (J. Applied Psychology, secondary numbers): Garamond read fastest of ten print faces. Wallace et al. 2022 as in D-5. Logo is contrast-exempt (WCAG 1.4.3). |
| D-26 | PDF through Electron `printToPDF`; DOCX and others through Pandoc; Pandoc PDF only when an engine is detected | VENDOR | Electron docs for `printToPDF`; Pandoc manual for formats and `--pdf-engine`; neither Pandoc nor a LaTeX engine is installed on this machine, confirmed 2026-10-16. |
| D-27 | File watching through chokidar with atomic-save handling and polling fallback on network paths | VENDOR | chokidar README (`atomic`, `awaitWriteFinish`, polling backend); Node `fs.watch` caveats (inconsistent across platforms, unreliable on SMB). Version drift to re-check at build time: chokidar 5.0.0 on npm vs v6 README. |

---

## 9. Review items (all decided 2026-10-16; answers in §12)

| ID | Question | My recommendation | Alternatives |
|---|---|---|---|
| R-1 | Electron or Tauri? | Electron: built-in PDF, mature CodeMirror integration, Node already installed. | Tauri: ~10× smaller install, Rust watcher, but PDF needs an external engine or a WebView print path. |
| R-2 | CodeMirror 6 or Monaco? | CodeMirror 6: lighter, better accessibility, Markdown-first. | Monaco if you want VS Code's exact editing feel. |
| R-3 | Default 18 px text and 1.5 line height | Keep 18 px (evidence says larger is better up to 24 px); keep 1.5 (standard-driven, no study backs any specific value). | 16 px for more content per screen; 20–24 px to follow Rello 2016 fully; line height 1.3 to follow Rello's "default spacing" finding. |
| R-4 | Editor font monospace or proportional by default | Monospace for table/code alignment, switch in settings. | Proportional: reads ~5 % faster per Mansfield 1996. |
| R-5 | Tabs on top | Top (Windows convention). | Left sidebar list, which scales better past ~15 tabs; no evidence either way (H-3). |
| R-6 | Include a third "High contrast" theme at AAA 7:1? | Yes if cheap: same tokens with `text #000000`, `text2 #3D3D3D`, `accent #0041A8`. | Rely on Windows forced-colours mode only. |
| R-7 | Hold-Alt shortcut overlay (ExposeHK-style) in v1? | v1.1; show shortcuts in menus/tooltips in v1. | v1 if hotkey adoption matters to you. |
| R-8 | Error and destructive states without red | Use icon + text + heavier border, all in text colour or blue, per your monochrome+blue brief. | Permit a single red (`#B3261E` light, 6.5:1; `#F2B8B5` dark, 11:1, both pass) for destructive actions only. |
| R-9 | Default pane mode | Split. | Editor-only with preview toggle, which gives the measure-limited preview more room. |
| R-10 | Linear or tree/selective undo | Linear in v1. | Tree undo (CodeMirror supports branching with a plugin); evidence of benefit is from code editing only. |
| R-11 | Exact watch policy | Silent reload when clean; banner when dirty. | Always banner (never reload silently); or always reload and keep a local backup. No academic evidence (H-8). |
| R-12 | Autosave target | Drafts folder only; "autosave to file" as an opt-in setting. | Autosave directly to the user's file (simpler mental model, but surprises users who open files in other tools). |
| R-13 | Keep the one Save/Don't save/Cancel dialog | Keep it; it is rare and consequential. | Replace with "close and keep draft" and no dialog at all, relying on the drafts folder. |
| R-14 | Code signing | Defer; unsigned NSIS installer will show a SmartScreen warning. | Buy a certificate before first release. |
| R-15 | Release gate: user test with a keyboard-only and a screen-reader user | Yes, two sessions. | Automated checks only. |
| R-16 | Where this project lives | Move `md-editor/` out of the Repo Scraping folder into its own repository before step 1. | Keep it here. |

---

## 10. Human research needed (no academic source found)

| ID | Gap | What was searched | Consequence in the plan |
|---|---|---|---|
| H-1 | A peer-reviewed minimum pixel/mm target size for mouse pointing | Fitts-law literature, Soukoreff & MacKenzie 2004, small-target studies | 32 px rests on the WCAG 24 px standard plus judgement. |
| H-2 | A numeric tab count at which performance degrades | Dubroy 2010, Huang & White 2010, Chang 2021 | Overflow design uses Dubroy's observational 9–13 figure. |
| H-3 | Tab placement, top vs side | CHI/UIST/HT venues | Convention. |
| H-4 | Empirical basis for an 8 px spacing grid | Material and practitioner guides only | Convention. |
| H-5 | Measured effect of autosave or crash recovery on lost work | PIM literature, Whittaker/Bergman | Autosave justified by Jones & Martin 2003 and user requests in Iqbal & Horvitz 2007 only. |
| H-6 | Live split-pane preview vs WYSIWYG vs toggle | Editor-evaluation literature | Only indirect evidence (Knauff & Nejasmic 2014). |
| H-7 | Monospace vs proportional for an editing task | Legibility literature | Only reading-speed evidence exists. |
| H-8 | Single-user "file changed on disk" reload-vs-keep policy | CSCW awareness and conflict literature | Policy follows vendor convention. |
| H-9 | A peer-reviewed experiment on visible focus indicators | CHI/ASSETS/TACCESS | Standard only (WCAG 2.4.7, 2.4.13). |
| H-10 | Scroll synchronisation between editor and preview | Any venue | Implemented as best-effort, switchable. |
| H-11 | Primary sources behind the 4.5:1 ratio (Arditi & Faye 2004 ARVO abstract; ISO 9241-3 text) | ARVO, ISO | Ratios used as a standard, not as a peer-reviewed claim. |
| H-12 | Peer-reviewed evaluation of APCA against WCAG 2 contrast | Scholar, W3C lists | WCAG 2.2 stays normative. |
| H-13 | Garamond-style serif legibility for on-screen UI text at modern resolutions | Bernard 2001 (did not test Garamond), Tinker | Garamond kept to the logo. |
| H-14 | Linear vs tree undo in prose editors | ICSE/CHI | Linear chosen. |
| H-15 | Peer-reviewed replication of icon-label studies after 1999 | BIT, CHI | Rests on Wiedenbeck 1999 and Kacmar & Carey 1991. |

---

## 11. Known weaknesses in the citation base (from the verification notes)

- Several findings were confirmed only through secondary pages, not the paper itself: Rello 2016 (spacing range), Josephson 2008, Hannebauer 2018 abstract, Paterson & Tinker 1932 numbers, Wallace 2022 Garamond figures, Marathe & Sundar 2011 results, Niemelä & Saarinen sample size.
- Bravo-Lillo et al. 2013's DOI came from citing reference lists, not a resolver.
- Usability News items (Bernard et al.; Chaparro et al.) are an institutional newsletter, not peer-reviewed, and are used only as supporting colour.
- Ware 2012, Bringhurst 2012 and Beier 2012 are books; the specific passages were not verified.
- Tool versions (Electron 44.8.0, Pandoc 3.12.1, chokidar 5.0.0 vs v6) were read on 2026-10-16 and must be re-checked when step 1 starts.

---

## 12. Decision log (user answers, 2026-10-16)

| ID | Decision | Effect on the plan |
|---|---|---|
| R-1 | Electron | §2 stack stands. |
| R-2 | CodeMirror 6 | §2 stack stands. |
| R-3 | 18 px default text size; line height 1.5 | §6 stands; both remain zoomable/adjustable. |
| R-4 | Monospace editor font (Cascadia Mono), proportional selectable | §6, D-6. |
| R-5 | Tabs on top | D-8. |
| R-6 | Add a High-contrast AAA theme | Step 5 now ships four theme choices; tokens in §7; checker covers it at 7:1. |
| R-7 | Hold-Alt shortcut overlay in v1 | Step 3 item 6 added; §5 updated. Alt-tap vs Alt-hold conflict is an engineering detail to test. |
| R-8 | One red token for destructive actions and errors only | `danger` added to all three themes in §7 and to the checker; D-12 note. |
| R-9 | Split pane by default | D-14. |
| R-10 | Linear undo | D-20. |
| R-11 | Silent reload when clean, banner when dirty | D-18. |
| R-12 | Autosave to drafts folder only; autosave-to-file is an opt-in setting | D-23. |
| R-13 | Keep the single Save / Don't save / Cancel dialog | D-21. |
| R-14 | Defer code signing | Step 8; SmartScreen warning accepted for personal use. |
| R-15 | User test with a keyboard-only and a screen-reader user is a release gate | Step 9. |
| R-16 | Move the project to its own folder and git repository before step 1 | Done 2026-10-16: now at `C:/Users/giann/md-editor`, empty git repository initialised, nothing committed. |

### R-16 action (completed)
The folder was moved with:

```
Move-Item "C:/Users/giann/Repo Scraping/md-editor" "C:/Users/giann/md-editor"
```

then `git init` inside the new location. The contrast checker and literature folder move with it unchanged.

---

## 13. Step 1 log (2026-10-16)

Step 1 (scaffold and security baseline) is done and launches. Outcomes and deviations, all ENGINEERING unless tagged:

- **Toolchain as generated:** Electron Forge 8.0.1 with the Vite + TypeScript template (Electron 44.8.0, Vite 8, TypeScript 6, oxlint/oxfmt). The old `--template=vite-typescript` flag no longer exists; the current form is `--template=vite --typescript`.
- **Layout:** `src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/index.ts` + `src/renderer/styles/{tokens,base}.css`, `index.html` at the root. Entry files must keep distinct basenames: naming both `index.ts` made Vite write both bundles to one `index.cjs`, Electron then quit at launch with an error dialog.
- **Security baseline in place:** contextIsolation, sandbox, no nodeIntegration, navigation and window.open refused (http links go to the OS browser), typed `window.md` bridge from the preload, Content-Security-Policy meta in `index.html` (`style-src 'unsafe-inline'` is needed by Vite's dev injection; tighten for packaged builds in step 8).
- **Tokens:** all three themes (light, dark, hc) and the forced-colours fallback live in `tokens.css`; `base.css` applies focus ring, selection, 32 px targets and reduced-motion.
- **Dev profile:** in development Chromium's user-data directory is `<project>/.dev-userdata/` (gitignored, excluded from Vite's watcher) so a sandboxed shell never writes to `%APPDATA%`. Packaged builds use Electron's default location.
- **Step 8 deviation:** Forge's Windows maker is Squirrel, not the electron-builder NSIS installer named in step 8. Both produce a per-user installer; switching later is a config change. REVIEW R-17: keep Squirrel (recommended, already wired) or switch to electron-builder.
- **Observed on this machine:** the OS theme is dark (`nativeTheme.shouldUseDarkColors` = true), so the "System" theme option will resolve to Dark here; Light remains the app default per D-10. The Claude desktop app probes `localhost:5173` while a dev server runs; the renderer now shows a plain message when opened outside Electron.
- **Checks passing:** `npx tsc --noEmit`, `npx oxlint`, `npx oxfmt --check` (scoped to code; prose and tools are excluded in `.oxfmtrc.json`), `tools/contrast_check.py` (3 themes).

## 14. Step 2 log (2026-10-16)

Step 2 (editor core) is done and verified in a live launch. What exists now:

- **Editor** (`src/renderer/editor.ts`): CodeMirror 6, Markdown language with fenced-code languages, line wrapping, line numbers, linear history (D-20). Markup colouring is a `Compartment` so it can be switched off (D-11); it uses only tokens (bold headings, `--link` for links, `--surface` for code, `--text2` for markers).
- **Preview** (`src/renderer/preview.ts`): markdown-it (html on, linkify on) → DOMPurify with `style`, `form`, `input`, `button` forbidden; every opening block token and fenced block carries `data-line` for scroll sync. Four Vitest tests cover CommonMark, script/handler/`javascript:` stripping, forbidden tags and line tagging (`npm test`).
- **Layout** (`src/renderer/layout.ts`): grid with `--split`, modes editor/split/preview (D-14), splitter as an ARIA separator (drag, arrow keys ±2 %, Shift ±10 %, Home/End), 20–80 % clamp.
- **Scroll sync** (`src/renderer/scrollSync.ts`): block-start alignment in both directions with a 120 ms lock against feedback; switchable (H-10).
- **Zoom** (`src/renderer/zoom.ts`): 12–32 px in 2 px steps on `--font-size`, default 18 (R-3); stored in localStorage until step 6.
- **Menu** (`src/main/menu.ts`): File, Edit (roles), View with accelerators shown beside every command (D-16); checkbox items for markup colouring and scroll sync; DevTools entry in development only. Commands reach the renderer through `window.md.onViewCommand`.
- **Toolbar**: pane-mode group and options group, icon glyph plus visible label (D-15), tooltips carrying the shortcut (D-16), `aria-pressed` state, 32 px targets (D-7).
- **Status bar**: line, column, word count, zoom size, `aria-live="polite"`.
- Deferred to step 3: file open/save and the document model (the editor shows a sample document); the detached DevTools auto-open was removed in favour of the View menu entry.
- ENGINEERING choices without a source: heading size ratios in `app.css`; 100 ms render debounce; 120 ms scroll-sync lock; splitter step sizes.

## 15. Step 3 log (2026-10-16)

Step 3 (tabs, document model, file I/O) is done; verified by a launch that opened a file passed on the command line.

- **Document model** (`src/renderer/documents.ts`): each tab owns a CodeMirror `EditorState` (text, selection, linear undo history, D-20), `savedText`, derived `dirty`, `diskHash`/`mtimeMs` for step 4, `scrollTop`. The store keeps order, the active id and the last ten closed documents for reopen. Five unit tests.
- **One editor, many states** (`src/renderer/editor.ts`): switching tabs swaps `EditorState`s, so undo history and selection survive per tab; the markup-colouring preference is re-applied on every swap.
- **Tab bar** (`src/renderer/tabs.ts`): WAI-ARIA tabs (roving tabindex, arrows, Home/End, Enter/Space, Delete closes). Dirty marker is a dot plus visually hidden "(modified)" text (WCAG 1.4.1). Close control at 32 px (D-7). Middle-click closes; drag reorders; the strip scrolls and an "All tabs" listbox appears when it overflows (D-9). Minimum tab width 140 px, maximum 240 px, so titles stay legible rather than shrinking (Dubroy & Balakrishnan 2010).
- **File I/O** (`src/main/files.ts`): open and save dialogs, read by path, atomic save (temp file, fsync, rename), SHA-256 content hash returned on every read/write for step 4's self-write detection. Two Node tests. Files dropped on the window and paths given on the command line open as tabs. A lone blank untitled tab is replaced when files are opened (ENGINEERING).
- **Close flow** (D-21, R-13): closing a dirty tab, or the window with dirty tabs, shows the single Save / Don't save / Cancel dialog per dirty document; the window close is intercepted in main and completed only after the renderer reports no cancellation.
- **Shortcuts**: File menu (Ctrl+T/O/S/Shift+S/W/Shift+T), View menu (Ctrl+Tab / Ctrl+Shift+Tab), Ctrl+1..9 in the renderer (9 = last), all listed in menus or Help (D-16).
- **Hold-Alt overlay** (R-7): `src/renderer/altKeys.ts` adds `show-keys` after 300 ms; CSS renders each `data-keys` badge on toolbar buttons and the first nine tabs. A plain Alt tap still reaches the Windows menu bar.
- **Title and status**: window title `name • – MD` when dirty; status bar shows path or "Not saved to disk", line/column, words, zoom.
- Deferred: tabs are not yet persisted (step 6); the sample document moved to Help › Open sample document.
- ENGINEERING choices without a source: 10-entry reopen stack; 300 ms Alt hold; 140–240 px tab widths; replacing a blank untitled tab on open.

## 16. Step 4 log (2026-10-16)

Step 4 (watch and reload) is done; verified live: a file opened from the command line was edited by another process and the app reloaded it within the `awaitWriteFinish` window.

- **Watcher** (`src/main/watcher.ts`): one chokidar watcher per open path with `atomic: true`, `awaitWriteFinish { stabilityThreshold: 200 }`, polling on UNC paths (D-27, VENDOR). Events: `file:changed` (carrying text + SHA-256 + mtime), `file:removed`, `file:watchError`. Watchers are started/stopped from the renderer as tabs come and go, and all are closed when the window closes.
- **Policy** (`src/renderer/watching.ts`, D-18): hash equal to the last known disk hash → ignored (our own save). Clean buffer → replaced in place through a CodeMirror transaction (undo history kept), status note "Reloaded … at hh:mm:ss". Dirty buffer → non-modal banner with Reload from disk / Keep mine / Show differences; "Keep mine" records the disk hash so the change is not re-asked and the next save overwrites. Deleted or renamed → danger-toned banner with Save as… / Close tab; the buffer becomes "unsaved" so it cannot be lost silently.
- **Diff** (`src/renderer/diff.ts`): LCS line diff with common prefix/suffix trimming, capped at 4,000 lines (three tests). Rendered in the banner as struck-through (yours) and bold link-coloured (disk) lines, with an aria-label explaining the convention; colour is never the only cue.
- **Banners** (`src/renderer/banners.ts`): polite live region between toolbar and workspace, labelled buttons, Escape dismisses, banners for closed tabs are removed automatically.
- ENGINEERING values without a source: 200 ms write-stability threshold; 8 s status-note lifetime; 4,000-line diff cap.
- Not verified by hand: the dirty-buffer banner path and the removed-file path were exercised by code review and unit tests only (the live test covered the clean-buffer reload).

## 17. Step 5 log (2026-10-16)

Step 5 (themes) is done.

- **Four choices** in View › Theme (radio items) and Ctrl+Shift+L to cycle: Light (default, D-10), Dark, High contrast (AAA, R-6), System. "System" follows Electron's `nativeTheme`, which mirrors `prefers-color-scheme` (STANDARD Media Queries 5 §12.5); the OS value is re-read whenever the preference changes and whenever the OS theme changes.
- **Service** (`src/renderer/theme.ts`): sets `data-theme` on `<html>`, reports the preference to main, which rebuilds the menu's radio state and sets `nativeTheme.themeSource` so native dialogs and scrollbars match (High contrast counts as light for the OS).
- **Tokens stay the single source**: themes are the three blocks in `tokens.css` (the plan's "JSON token files" became CSS blocks; same content, one fewer build step). `tools/contrast_check.py` remains for ad-hoc use.
- **CI gate** (`src/renderer/styles/tokens.test.ts`): parses `tokens.css` and asserts all 17 pairs per theme (51 assertions) at 4.5:1 / 3:1, and 7:1 text for High contrast, on every `npm test` run (D-25; Sandnes 2016).
- Persistence is still localStorage until step 6 moves it into `session.json`.
- Not verified by hand: visual appearance of Dark and High contrast; only the ratios are machine-checked.

## 18. Step 6 log (2026-10-16)

Step 6 (session state) is done; verified live: a launch with a file, a forced stop, then a launch with no arguments reopened the same tab, and `session.json` carried the window bounds.

- **Store** (`src/main/session.ts`): `session.json` in userData with `version`, UI state (theme, pane mode, split, font size, markup colouring, scroll sync), window bounds, tabs (path, name, selection anchor/head, scroll, dirty, draft id), active index, last ten closed. Written atomically (temp, fsync, rename). Unknown versions or corrupt files are ignored, never deleted. Drafts live in `userData/drafts/<uuid>.md`; ids are validated as UUIDs so a path can never be injected. Five tests.
- **Capture** (`src/renderer/session.ts`): debounced 500 ms after any text, cursor, scroll, tab, layout, zoom or theme change; immediate on window blur and before close. Dirty documents get their text written to a draft on the same debounce (only when it changed); drafts are deleted when the document becomes clean or is closed, and unreferenced drafts are pruned at startup (D-23, R-12; Jones & Martin 2003; Iqbal & Horvitz 2007).
- **Restore** (D-22; Czerwinski et al. 2004; Mark et al. 2005; Iqbal & Horvitz 2007; Trafton et al. 2003): tabs reopen in order with selection and scroll; the draft, if any, becomes the buffer and a "Recovered unsaved changes" banner offers to discard it; a missing file with a draft shows the draft plus a danger banner; a missing file with no draft is reported and skipped. UI state is re-applied before documents load. Files given on the command line open after the restore and become active.
- **Window bounds** are restored only when they intersect a connected display's work area, otherwise defaults apply; maximised state is restored.
- The `main` process keeps the last renderer snapshot so a resize or move alone updates the file without the renderer's help.
- ENGINEERING values without a source: 500 ms debounce; ten closed tabs; 500 ms bounds debounce.
- Not verified by hand: draft recovery after a crash with unsaved text (unit-tested write/read/delete only); the "Discard recovered changes" action.

## 19. Step 7 log (2026-10-16)

Step 7 (export) is done.

- **Dialog** (`src/renderer/exportDialog.ts`): Export › Export… (Ctrl+E) opens a native `<dialog>` form listing HTML, PDF, Word, OpenDocument, EPUB, RTF, LaTeX and PDF-via-Pandoc, each with a one-line description and its dependency status; unavailable rows are disabled and say why. Page size (A4/Letter) applies to PDF; the default follows the OS locale (Letter for en-US, en-CA, es-MX, en-PH; ENGINEERING). When Pandoc is missing the dialog shows the install command with a Copy button.
- **HTML** (`src/renderer/exportHtml.ts`, `src/main/export.ts`): one self-contained file — light tokens plus a print subset of the preview rules, strict CSP, no scripts; local images under 5 MB are inlined as data URIs by the main process (tested). Always light colours regardless of the on-screen theme (positive polarity for print; D-10).
- **PDF** (built in, D-26): the same HTML loaded in a hidden sandboxed window and printed with `webContents.printToPDF` (A4/Letter, 0.6–0.7 in margins, document outline on). Verified with a standalone script in this Electron version.
- **Pandoc formats** (D-26, VENDOR): `pandoc -f gfm -t <format> --standalone --metadata title=… --resource-path=<doc dir>` with the Markdown on stdin; PDF via Pandoc only when an engine (typst, weasyprint, wkhtmltopdf, xelatex, pdflatex) is found on PATH. Capabilities are probed each time the dialog opens. Neither Pandoc nor an engine is installed on this machine, so those paths are untested here.
- **Bundled `reference.docx`** for Word styling (step 7.3) was not produced: generating one requires Pandoc itself. REVIEW R-18: ship Pandoc's default styles (current) or hand-author a reference document later.
- Not verified by hand: the dialog flow end to end (native save dialog), and every Pandoc path.

## 20. Step 8 log (2026-10-16)

Step 8 (logo and packaging) is done; the packaged executable was launched with a file argument and behaved like the dev build (bridge, tab, session in `%APPDATA%\MD`).

- **Logo** (`tools/build-logo.mjs`, `npm run build:logo`): "MD" set in EB Garamond Medium from `@fontsource/eb-garamond` (SIL OFL 1.1; licence copied to `assets/LICENSE-EB-Garamond.txt`), converted to outlines with opentype.js and centred on cap height in a 512 px white square → `assets/logo.svg`; rasterised with resvg to 16–512 px PNGs; `assets/app.ico` built from the 16–256 px set (D-24). No font is needed at runtime. Microsoft's Garamond is not used (proprietary, absent on this machine).
- **In-app**: Help › About MD shows the outlined logo, version and component licences.
- **Packaging** (`forge.config.mts`): app name MD, executable `md.exe`, icon `assets/app.ico`, Windows file metadata; makers Squirrel (setup icon) and ZIP for win32 only. `npm run package` produced `out/MD-win32-x64/` (≈370 MB unpacked, ≈247 MB executable; Electron's baseline). Fuses as generated by Forge (no `RunAsNode`, ASAR integrity on).
- **R-14** stands: unsigned; SmartScreen will warn on first run of the installer.
- **R-17** stands: Squirrel installer rather than NSIS.
- Not done: Windows file association for `.md` (Squirrel has no first-class support; REVIEW R-19 if wanted later).

## 21. Step 9 log (2026-10-16)

Step 9 (accessibility and quality gates) is done as far as automation goes; the human parts are listed in §22.

- **Unit tests** (`npm test`): 73 tests in 8 files — preview sanitising and line tagging, document store, line diff, session store and drafts, export HTML builder and image inlining, and the WCAG contrast gate that parses `tokens.css` (51 pair assertions across three themes, D-25).
- **End-to-end** (`npm run package` then `npm run test:e2e`, `e2e/app.spec.ts`): Playwright launches the production bundle with the development Electron binary (the packaged `md.exe` carries Forge fuses that disable the Node inspector flags Playwright needs) and an isolated profile via `MD_USER_DATA`. It opens a file from the command line, creates a tab from the toolbar, types, checks the non-colour dirty marker and title, jumps with Ctrl+1, switches pane modes, resizes the splitter by keyboard, navigates tabs by arrow keys, closes, relaunches, and verifies both tabs, the recovered draft banner and the splitter position came back. A second test runs axe-core over the main screen: **zero violations** at any impact level after two fixes below.
- **Fixes the axe run forced**: (1) the tab close control is no longer a focusable button inside `role=tab` (nested-interactive, serious) nor a wrapper around the tab (aria-required-children, critical); it is a mouse-only affordance, and keyboard users close with Delete, Ctrl+W or middle-click, as the tooltip states. (2) `role=status` was removed from the footer (aria-allowed-role, minor); it keeps `aria-live="polite"`.
- **Forced colours** (Windows high-contrast mode) is honoured by the `forced-colors` block in `tokens.css`; **reduced motion** by `base.css`. Neither is machine-verified.
- **Not automated** (needs a person; R-15 is a release gate): NVDA walkthrough of tabs, banners and dialogs; 200 % display scaling; Windows forced-colours appearance; the export dialog's native save dialogs; the Pandoc paths (Pandoc is not installed here); keyboard-only user test and screen-reader user test (CITED Power et al. 2012: guideline compliance covered only half of the problems blind users met).

## 22. Hand-over test checklist (for the user)

Run from source with `npm start`, or install `out/make/squirrel.windows/x64/MD-0.1.0 Setup.exe` (SmartScreen will warn; R-14).

1. **Tabs**: Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1…9, middle-click close, drag to reorder, open ≥12 files and use the "All tabs" button, Ctrl+Shift+T after closing.
2. **Files**: Ctrl+O, drop files on the window, Ctrl+S, Ctrl+Shift+S, close a dirty tab (Save / Don't save / Cancel), close the window with two dirty tabs.
3. **Watching**: open a file, edit it in Notepad and save → it reloads with a status note; type in MD first, then edit in Notepad → banner with Reload / Keep mine / Show differences; delete the file in Explorer → banner with Save as… / Close tab.
4. **Themes**: View › Theme, Ctrl+Shift+L, System while toggling Windows dark mode; check dialogs follow.
5. **Session**: arrange tabs, cursor, scroll, split and theme; quit; relaunch; then type without saving, kill the process from Task Manager, relaunch → "Recovered unsaved changes" banner.
6. **Export**: Ctrl+E → HTML and PDF; install Pandoc and retry Word.
7. **Accessibility**: Tab through the whole UI with focus always visible; hold Alt for the shortcut badges; NVDA on the tab strip (dirty "(modified)" announced), banners and the export dialog; Windows high-contrast mode; 200 % scaling.
8. **Logo**: Help › About, and the taskbar icon of the packaged build.

## 23. Distribution log (2026-10-17)

- **Repository**: public, https://github.com/GianniGuava/md-editor (user's choice; a public repo is also what update.electronjs.org requires).
- **Publishing** (VENDOR: Electron Forge publisher-github): `npm run release` builds the Squirrel artefacts and uploads them to a **draft** GitHub release; the user publishes it by hand (README "Releasing").
- **Auto-update** (VENDOR: update-electron-app README; Electron autoUpdater docs): packaged builds installed by Squirrel poll `https://update.electronjs.org/GianniGuava/md-editor/win32-x64/<version>` hourly and prompt to restart when an update is downloaded. Guarded by `app.isPackaged` and the presence of Squirrel's `Update.exe`, so development and portable copies never start it. Verified: a portable copy logged the feed URL and then stopped at "Can not find Squirrel" before the guard was added; the guard now skips it.
- **REVIEW R-20 — code signing** (research verified on live pages 2026-10-17; details and URLs in the research summary below):
  - *Azure Artifact Signing* (the new name of Azure Trusted Signing, same pricing): Basic **$9.99/month** for 5,000 signatures, no hardware token, paid Azure subscription required. Individuals are accepted only in the **US or Canada** (government-ID validation); organisations in a longer list of countries. Microsoft's current docs no longer state a years-in-business rule (its removal is reported but NOT CONFIRMED officially).
  - *OV certificates*: SSL.com from **$129/year** plus a FIPS hardware key (YubiKey +$379) or their cloud signer; Certum cloud signing from **€209** (open-source projects from **€49**, no hardware); DigiCert from **$696/year**. Since June 2023 all OV keys must live on hardware or a cloud HSM.
  - *SmartScreen* (Microsoft, updated 2026-08-17): any valid OV/EV/Artifact-Signing certificate still shows a warning **until reputation accumulates** ("several weeks and hundreds of clean installs"); EV no longer bypasses it. Only Store distribution avoids the warning outright.
  - *Forge wiring* (VENDOR: Forge code-signing guide; `@electron/windows-sign` 2.1.0): `packagerConfig.windowsSign` with `signWithParams: "/v /dlib <Azure.CodeSigning.Dlib.dll> /dmdf <metadata.json>"`, `timestampServer: "http://timestamp.acs.microsoft.com"`, `hashes: ['sha256']`, plus the same object on `MakerSquirrel`; paths must not contain spaces. For a PFX or token: `MakerSquirrel({ certificateFile, certificatePassword })` or `/sha1 <thumbprint>`.
  - **Recommendation**: if the user is in the US or Canada, Artifact Signing Basic is the cheapest route with no hardware; otherwise Certum's cloud certificate. Either way friends will still see SmartScreen warnings for the first weeks. Not enabled; decision is the user's (cost, identity verification).
- Sources (confirmed by the research agent): https://azure.microsoft.com/en-us/products/artifact-signing ; https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart ; https://learn.microsoft.com/en-us/azure/artifact-signing/faq ; https://www.ssl.com/products/software-integrity/code-signing/ov/ ; https://shop.certum.eu/code-signing.html ; https://www.digicert.com/signing/code-signing-certificates ; https://www.electronforge.io/guides/code-signing/code-signing-windows ; https://github.com/electron/windows-sign ; https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation

## 24. Multiple windows and tab tear-off (2026-10-18)

User request: open several windows; drag a tab out of a window to open it in a new one.

- **Window manager** (`src/main/main.ts`): any number of BrowserWindows, each with a stable session id. File › New window (Ctrl+Shift+N) and a toolbar button cascade a window 40 px from the focused one; File › Close window (Ctrl+Shift+W). Menu commands go to the focused window. Dialogs attach to the focused window.
- **Session schema v2** (`src/main/session.ts`): `theme` is global; everything else (bounds, pane mode, split, zoom, options, tabs, active tab, closed stack) is per window. Version 1 files are migrated into one window (tested). Rule for what restores: a window closed while others stay open is dropped from the session; closing the last window, or quitting, keeps every window so the next launch reopens them all. Session writes from renderers are immediate and the quit path waits for the final write (a debounce here lost the last save before exit).
- **Watchers** (`src/main/watcher.ts`) are shared: one chokidar watcher per path, reference-counted by window, events broadcast to all windows; renderers ignore paths they do not have open.
- **Tear-off** (`src/renderer/tabs.ts`, `index.ts`): a tab drag carries the document as a snapshot (text, selection, scroll, dirty flag, draft id). Released outside every MD window → `tab:detach` → main opens a new window at the cursor and hands the document over when that renderer reports ready (a request, not a push, so the new window never also creates a blank tab). Dropped on another MD window's tab strip → that window adopts the document at the drop position, reports `tab:dropped`, and main tells the source to remove its copy. `tab:detach` waits 400 ms for such a report before opening a new window, so a drop on another window never also spawns one (ENGINEERING timing). The draft id travels with the document; the source window "forgets" it so the draft is neither deleted nor rewritten there. File › Move tab to new window does the same from the keyboard.
- **Evidence**: tabbed multi-window use follows the same CITED basis as tabs (Dubroy & Balakrishnan 2010: tabs as parallel-task and reminder tools; Huang & White 2010). Dragging a tab out to form a window is a browser convention (Chrome, Firefox, Edge); no academic study on tear-off gestures was sought — **H-16, human research needed**. The 40 px cascade and 400 ms grace are ENGINEERING values.
- **Tests**: Vitest covers the v1→v2 migration; the e2e suite opens a second window from the toolbar, hands a document to a brand-new window through the bridge, closes one window, relaunches and checks both remaining windows return. The OS-level drag between windows cannot be driven by Playwright, so the gesture itself is on the manual checklist (§22 item 1).
- **Known limitation**: Windows Application Control on this machine began blocking oxlint's native module on 2026-10-18 ("An Application Control policy has blocked this file"); `npm run lint` fails until the policy allows it. Type-check, tests and e2e are unaffected.

## 25. Smart App Control (2026-10-18)

- Smart App Control switched from evaluation to on (registry `VerifiedAndReputablePolicyState` = 1) and now blocks the unsigned `out\MD-win32-x64\md.exe` and oxlint's native module ("An Application Control policy has blocked this file"; Code Integrity events 3033/3077). Packaging rewrites Electron's executable (icon, version info), which voids Electron's signature; the untouched `node_modules\electron\dist\electron.exe` is allowed.
- Workaround in place: the desktop shortcut runs the production bundle through the signed runtime with a new `--appdata` flag (standard profile, MD icon on the window). Auto-update is inert in this mode. The installer and packaged copy were rebuilt but cannot run on this machine until signed.
- Consequence for R-20: code signing is no longer optional for this PC; Azure Artifact Signing (if eligible) or a Certum/SSL.com certificate is the route. Turning Smart App Control off is the user's decision and is irreversible without a Windows reinstall.
- Safeguard added: every launch copies the prior `session.json` to `session.previous.json` before writing (the 2026-10-18 tab list of two files was not found in the session file; cause unknown, nothing overwritten by the app, no drafts lost).

## 26. Footnotes (2026-10-19)

User report: `[^3]` rendered as plain text. Footnotes are a Pandoc / PHP-Markdown-Extra extension, not CommonMark or GFM, so markdown-it needs `markdown-it-footnote` (VENDOR). Added to the preview pipeline: references become superscript links, definitions a numbered list at the end with back-links; notes are renumbered in order of appearance (the same behaviour as Pandoc). DOMPurify passes the markup (ids, classes, fragment links) unchanged; the target of a clicked reference is highlighted with the selection token. Pandoc exports now read `gfm+footnotes` so Word and the other formats keep them. Unit test added; verified in the app by screenshot. Styling (smaller, secondary-coloured list under a rule) is ENGINEERING.

## 27. Cursor ↔ block highlight (2026-10-19)

User request: synchronise highlighting between editor and preview. Built on the existing per-block source lines (`data-line`, now also `data-line-end`): the innermost rendered block containing the editor's cursor line gets a 3 px accent bar to its left and is kept in view; a cursor on a blank line between blocks marks nothing; clicking a block in the preview (not a link) moves the cursor to the block's first line and focuses the editor. It follows the existing "Sync scroll" toggle rather than adding a control (ENGINEERING; D-19 grouping). No study on cross-pane highlighting was sought — folded into H-10. Verified in the e2e suite (marked block present after typing; preview click reports the line in the status bar) and by screenshot.

## 28. Window would not close with two windows open (2026-10-19)

User report: a window could not be closed and the new cursor highlight did not appear. Cause: both windows' renderers save the session at nearly the same moment; the atomic write named its temp file by process id only, so the two writes shared it and one rename failed. The renderer's save chain (`saving = saving.then(...)`) never recovered from a rejection, so every later flush rejected, and the close handshake awaited that flush, so `closeNow()` was never sent. The highlight was absent only because the running copy predated the rebuild and could not be restarted.

Fixes: temp names unique per call; writes to one path serialised in the main process and the rename retried on transient EPERM/EBUSY (Windows reports these when a target is momentarily held by another replace, antivirus or the indexer — verified by a test that writes the same path five times concurrently); `session.json` writes queued; a failed flush is logged and the next one proceeds; closing never waits on a failed flush. Lesson recorded: the e2e suite closed windows through `closeNow()` directly and so never exercised the X-button handshake with two windows open.

## 29. Cursor highlight in tables (2026-10-19)

User report: the cursor highlight misbehaved in tables. Two causes: table rows carry source lines and are the innermost block, but a `<tr>` paints no box shadow, so the bar disappeared; and the keep-in-view check used `offsetTop`, which for a row is measured from the table rather than the scrolling pane, so the preview kept scrolling while the cursor moved through rows. Fixes: visibility is measured with screen rectangles of the block and the pane; a marked row shows the bar as an inset on its first cell. Verified by a scripted run (cursor through three rows: pane scroll unchanged) and screenshot.

## 30. Character-level cursor sync (2026-10-19)

User request: mirror the cursor by character, not only by block. Approach: CodeMirror's Lezer syntax tree gives exact positions of every markup node, so the editor builds a "visible text" map of the block under the cursor (`src/renderer/caretMap.ts`, `editor.blockMap()`): markup nodes contribute nothing (emphasis, code, link and heading marks, URLs, list and quote marks, task markers), escapes and entities count as one character, whitespace is trimmed at line starts/ends and around table-cell boundaries, images and inline HTML are dropped. The preview walks the marked block's text nodes (skipping the whitespace markdown-it emits between structural tags) to the same offset and inserts a zero-width caret span; a click in the preview uses `caretPositionFromPoint` and the same map in reverse to land the editor cursor on that character. Known drift: footnote references (`[^3]` renders as `[1]`) and autolinks shift by a character or two inside the affected block; positions are clamped to the block. Verified by a scripted run across emphasis, a link, a code span, a list item and a table row, plus a reverse click; unit tests on the map. ENGINEERING throughout; no literature was sought for cross-pane caret mirroring (H-10).
