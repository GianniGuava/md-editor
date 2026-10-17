# MD

A tabbed Markdown editor for Windows: live preview, file watching with reload, themes
(light, dark, high contrast, system), session restore with crash-safe drafts, and
export to HTML, PDF and, through Pandoc, Word and other formats.

Every design decision is recorded in [PLAN.md](PLAN.md) with a citation, a standard,
vendor documentation, or an explicit review item. Citation details are in `literature/`.

## Run from source

```bash
npm install
npm start
```

Open a file with the dialog (Ctrl+O), by dropping it on the window, or by passing a path:

```bash
npx electron-forge start -- C:\path\to\notes.md
```

In development the app keeps its profile and session in `.dev-userdata/` inside the
project. Packaged builds use `%APPDATA%\MD\`.

## Checks

| Command | What it runs |
|---|---|
| `npm run check` | type-check, lint, unit tests |
| `npm test` | Vitest: preview sanitiser, document store, diff, session store, export helpers, and the WCAG contrast gate over every theme in `tokens.css` |
| `npm run package` then `npm run test:e2e` | Playwright against the production bundle: file open, tabs, panes, splitter keyboard, session restore across a relaunch, axe-core scan |
| `python tools/contrast_check.py` | the same contrast check as a standalone script |

## Build

```bash
npm run build:logo   # regenerates assets/logo.svg, PNGs and app.ico from EB Garamond
npm run package      # out/MD-win32-x64/md.exe
npm run make         # out/make/squirrel.windows/x64/MD-<version> Setup.exe and a zip
```

The installer is unsigned (PLAN.md R-14); Windows SmartScreen will warn on first run.

## Export dependencies

HTML and PDF need nothing extra. Word, OpenDocument, EPUB, RTF and LaTeX need
[Pandoc](https://pandoc.org): `winget install JohnMacFarlane.Pandoc`. PDF through
Pandoc additionally needs an engine such as `typst` or `weasyprint` on the PATH.

## Licences

Application code: MIT. Logo glyphs: EB Garamond, SIL Open Font License 1.1
(`assets/LICENSE-EB-Garamond.txt`). Editor: CodeMirror 6 (MIT). Preview: markdown-it
(MIT) and DOMPurify (Apache-2.0 / MPL-2.0).
