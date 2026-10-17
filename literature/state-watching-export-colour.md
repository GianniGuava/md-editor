# Citation verification: session state, autosave, file watching, colour standards, themes, export tooling, logo typeface

Checked 2026-10-16 by a research agent. Every DOI resolved against a live metadata record (OpenAlex or Crossref). Findings come from author-hosted PDFs (text-extracted) or live abstract pages. Standards and vendor pages fetched directly.

## 1. Session restore / resuming interrupted work — all confirmed

- **Mark, G., Gonzalez, V. M., & Harris, J. (2005).** No task left behind? Examining the nature of fragmented work. *CHI '05*, 321–330. https://doi.org/10.1145/1054972.1055017 — Confirmed (OpenAlex + https://www.ics.uci.edu/~gmark/CHI2005.pdf). Conference. 24 workers; ~11 min per working sphere before switching; 57.1% of segments interrupted; 77.2% resumed same day after >2 intervening activities. Re-entry must be cheap.
- **Iqbal, S. T., & Horvitz, E. (2007).** Disruption and recovery of computing tasks. *CHI '07*, 677–686. https://doi.org/10.1145/1240624.1240730 — Confirmed (OpenAlex + https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf). Conference. 27 users, two weeks; resumption phase averaged 16 min 33 s before applications were returned to pre-suspension state; ~3 windows left suspended per diversion. Interviewees did not save before switching and said "an auto-save upon switch feature would be helpful."
- **Czerwinski, M., Horvitz, E., & Wilhite, S. (2004).** A diary study of task switching and interruptions. *CHI '04*, 175–182. https://doi.org/10.1145/985692.985715 — Confirmed (OpenAlex + interruptions.net PDF). Conference. Returned-to tasks rated harder to switch to (F(1,497)=8.45, p<.001), involved more documents (2.5 vs 1.6); authors call for software to "preserve and recreate multiple resources representing the state of a task."
- **Trafton, J. G., Altmann, E. M., Brock, D. P., & Mintz, F. E. (2003).** Preparing to resume an interrupted task. *IJHCS, 58*(5), 583–603. https://doi.org/10.1016/S1071-5819(03)00023-5 — Confirmed. Journal. Resumption lag significantly longer than normal inter-action lag (F(1,16)=22.2); an 8 s warning let people encode goals. Lab study on a naval task: cite as mechanism, not editor-specific.

## 2. Autosave / data loss — thin

- **Jones, G. V., & Martin, M. (2003).** Individual differences in failing to save everyday computing work. *Applied Cognitive Psychology, 17*(7), 861–868. https://doi.org/10.1002/acp.935 — Confirmed (OpenAlex + https://wrap.warwick.ac.uk/9082/). Journal. Loss of work through forgetting to save related to Cognitive Failures Questionnaire scores. The system should own persistence.
- Iqbal & Horvitz 2007 (above): users asked for autosave on switch.
- **NOT FOUND — human research needed:** any peer-reviewed study measuring reduction in lost work from autosave or crash recovery; no Whittaker "cost of lost work" paper exists under that title.

## 3. External file change handling

- **Dourish, P., & Bellotti, V. (1992).** Awareness and coordination in shared workspaces. *CSCW '92*, 107–114. https://doi.org/10.1145/143457.143468 — Confirmed (Crossref + dourish.com PDF). Conference. Passive awareness through the workspace beats active locks/roles.
- **Gutwin, C., & Greenberg, S. (2002).** A descriptive framework of workspace awareness for real-time groupware. *CSCW, 11*(3–4), 411–446. https://doi.org/10.1023/A:1021271517844 — Confirmed. Journal. Awareness elements include "what has changed" and "when."
- **Grinter, R. E. (1996).** Supporting articulation work using software configuration management systems. *CSCW, 5*(4), 447–465. https://doi.org/10.1007/BF00136714 — Confirmed. Journal. Indirect (merge coordination).
- **Sarma, A., Noroozi, Z., & van der Hoek, A. (2003).** Palantír. *ICSE 2003*, 444–454. https://doi.org/10.1109/ICSE.2003.1201222 — Confirmed. Conference. Surface parallel changes early, unobtrusively, with a severity cue.
- **Brun, Y., Holmes, R., Ernst, M. D., & Notkin, D. (2011).** Proactive detection of collaboration conflicts. *ESEC/FSE '11*, 168–178. https://doi.org/10.1145/2025113.2025139 — Confirmed. Conference. Conflicts are frequent and persistent; warn proactively without interrupting.
- **NOT FOUND — human research needed:** a study on the single-user "file changed on disk: reload or keep?" decision. The auto-reload-when-clean / prompt-when-dirty policy is a vendor convention (VS Code, Sublime), not cited.

## 4. Colour contrast — WCAG 2.2 (standard)

W3C. (2024). *WCAG 2.2*. W3C Recommendation, 12 Dec 2024. https://www.w3.org/TR/WCAG22/
- 1.4.1 Use of Color (A) — https://www.w3.org/TR/WCAG22/#use-of-color
- 1.4.3 Contrast (Minimum) (AA) — https://www.w3.org/TR/WCAG22/#contrast-minimum — text ≥4.5:1; large text (≥18 pt or ≥14 pt bold) ≥3:1; logotypes exempt.
- 1.4.6 Contrast (Enhanced) (AAA) — ≥7:1.
- 1.4.11 Non-text Contrast (AA) — https://www.w3.org/TR/WCAG22/#non-text-contrast — UI components and states ≥3:1.
- 1.4.12 Text Spacing (AA) — https://www.w3.org/TR/WCAG22/#text-spacing — no loss at line-height 1.5×, paragraph 2×, letter 0.12×, word 0.16×.
- 2.4.7 Focus Visible (AA) — https://www.w3.org/TR/WCAG22/#focus-visible
- **2.4.11 is Focus Not Obscured (Minimum) (AA)** — https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum
- **2.4.13 Focus Appearance (AAA)** — https://www.w3.org/TR/WCAG22/#focus-appearance — ≥2 CSS px perimeter, ≥3:1 focused/unfocused change.
- 2.5.8 Target Size (Minimum) (AA) — https://www.w3.org/TR/WCAG22/#target-size-minimum — ≥24×24 CSS px.
- Relative luminance — https://www.w3.org/TR/WCAG22/#dfn-relative-luminance ; contrast ratio — https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio

Rationale for 4.5:1 (non-peer-reviewed companion): W3C WAI, *Understanding SC 1.4.3*. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html — 3:1 from ISO 9241-3 / ANSI HFES 100-1988 × 1.5 contrast-sensitivity loss at 20/40 acuity (Arditi & Faye 2004). **Primary sources NOT independently confirmed:** Arditi & Faye 2004 is an ARVO abstract not locatable; ISO 9241-3:1992 withdrawn 2008, replaced by ISO 9241-30x.

Peer-reviewed on WCAG contrast:
- **Sandnes, F. E. (2016).** Understanding WCAG2.0 colour contrast requirements through 3D colour space visualisation. *Universal Design 2016*, SHTI 229, 366–375. https://doi.org/10.3233/978-1-61499-684-2-366 — Confirmed. Pick palette colours against the compliant set up front.
- APCA (Somers/Myndex, https://github.com/Myndex/SAPC-APCA) — non-peer-reviewed. WCAG 3.0 Working Draft (10 Sept 2026, https://www.w3.org/TR/wcag-3.0/) says the contrast algorithm "is yet to be determined." Peer-reviewed APCA-vs-WCAG2 evaluation: **NOT FOUND.** Keep WCAG 2.2 ratios normative.

## 5. Themes / personalisation / OS dark mode

- **Blom, J. (2000).** Personalization: A taxonomy. *CHI '00 EA*, 313–314. https://doi.org/10.1145/633292.633483 — Confirmed. Definitional only.
- **Blom, J. O., & Monk, A. F. (2003).** Theory of personalization of appearance. *Human–Computer Interaction, 18*(3), 193–228. https://doi.org/10.1207/S15327051HCI1803_1 — Confirmed. Journal.
- **Monk, A. F., & Blom, J. (2007).** A theory of personalisation of appearance: Quantitative evaluation. *Behaviour & Information Technology, 26*(3), 237–246. https://doi.org/10.1080/01449290500348168 — Confirmed. Journal. Personalisation yields ownership/attachment; a satisfaction feature, not a performance feature.
- **Marathe, S., & Sundar, S. S. (2011).** What drives customization? Control or identity? *CHI '11*, 781–790. https://doi.org/10.1145/1978942.1979056 — Confirmed; specific numbers unverified (paywalled).
- **STANDARD:** W3C CSS WG. (2026). *Media Queries Level 5*, Working Draft 19 Feb 2026, §12.5 prefers-color-scheme. https://www.w3.org/TR/mediaqueries-5/#prefers-color-scheme — `light | dark`; light when no preference. Working Draft, not Recommendation.
- Note: no evidence of a performance benefit from themes.

## 6. Export tooling (vendor docs) — confirmed

- **Pandoc User's Guide** https://pandoc.org/MANUAL.html ; pandoc 3.12.1 (2026-10-07) per https://pandoc.org/releases.html. Outputs `docx`, `html5`; PDF by default needs a LaTeX engine; `--pdf-engine` accepts pdflatex, lualatex, xelatex, latexmk, tectonic, wkhtmltopdf, weasyprint, pagedjs-cli, prince, context, groff, typst.
- **Electron** `webContents.printToPDF(options)` https://www.electronjs.org/docs/latest/api/web-contents ; Electron 44.8.0 (npm latest). Returns `Promise<Buffer>`; options landscape, displayHeaderFooter, printBackground, scale, pageSize (default Letter), margins, pageRanges, header/footerTemplate, preferCSSPageSize, generateTaggedPDF (experimental), generateDocumentOutline (experimental).
- **Chromium headless** https://developer.chrome.com/docs/chromium/headless and https://developer.chrome.com/docs/automation-and-testing/headless-cli — `--print-to-pdf`, `--no-pdf-header-footer`.

## 7. File watching (vendor docs) — confirmed

- **chokidar** https://github.com/paulmillr/chokidar — npm latest 5.0.0 (node ≥20.19); README describes a v6 rewrite (Oct 2026, Node 22+) not yet tagged latest — version drift to re-check. Fixes fs.watch issues (rename-only events, double fires, inconsistent recursion). `atomic`: temp-file saves (`unlink`+`add` within 100 ms) emitted as one `change`. `awaitWriteFinish` holds events until size is stable for `stabilityThreshold` ms. Native recursive watching on Windows; `backend: 'polling'` available.
- **Node.js fs.watch caveats** https://nodejs.org/api/fs.html#caveats — "not 100% consistent across platforms"; Windows uses ReadDirectoryChangesW; no events if watched directory is moved/renamed; EPERM when deleted; unreliable on NFS/SMB; `fs.watchFile()` polling fallback "slower and less reliable"; `filename` may be null.
- **Rust notify** https://docs.rs/notify/latest/notify/ — 8.2.0 stable, 9.0.0-rc.5 on crates.io. Backend ReadDirectoryChangesW on Windows; "events can differ a lot between file editors"; debouncers available. Relevant only if the Tauri alternative is chosen.

## 8. Logo typeface

- **EB Garamond licence — confirmed.** SIL OFL 1.1, no Reserved Font Name. https://github.com/google/fonts/blob/main/ofl/ebgaramond/OFL.txt ; origin https://github.com/georgd/EB-Garamond (based on 1592 Egenolff-Berner specimen).
- **SIL OFL 1.1 terms** https://openfontlicense.org/open-font-license-official-text/ — may be bundled, embedded, redistributed with any software; not sold alone; distributed under OFL.
- **Microsoft "Garamond" — proprietary.** https://learn.microsoft.com/en-us/typography/font-list/garamond — Monotype Garamond, available within Office (cloud font), not a Windows system font. https://learn.microsoft.com/en-us/typography/fonts/font-faq — no redistribution, conversion or modification; app embedding needs a Monotype licence. Not installed on this machine.
- **Books (not peer-reviewed):** Bringhurst, R. (2012). *The elements of typographic style* (v4.0). Hartley & Marks. ISBN 978-0-88179-211-9. Beier, S. (2012). *Reading letters: Designing for legibility*. BIS Publishers. ISBN 978-90-6369-271-1. Garamond-specific passages unverified.
- **Wallace, S., et al. (2022).** Towards individuated reading experiences: Different fonts increase reading speed for different individuals. *ACM TOCHI, 29*(4), 38. https://doi.org/10.1145/3502222 — Confirmed. Journal. 35% WPM spread across 16 fonts; EB Garamond highest mean (312 WPM) but fastest for only ~48% of readers who saw it. Garamond figures via NN/g secondary (https://www.nngroup.com/articles/best-font-for-online-reading/); spot-check the paper's table.
- **Rello, L., & Baeza-Yates, R. (2016).** The effect of font type on screen readability by people with dyslexia. *ACM TACCESS, 8*(4), 1–33. https://doi.org/10.1145/2897736 — Confirmed. Journal. 97 participants (48 dyslexic), 12 fonts incl. Garamond: sans-serif, monospaced and roman styles read significantly better than serif, proportional and italic. Keep Garamond to the logo; UI/body stays sans-serif.
- **Beier, S., & Larson, K. (2013).** How does typeface familiarity affect reading performance and reader preference? *Information Design Journal, 20*(1), 16–31. https://doi.org/10.1075/idj.20.1.02bei — Confirmed. Familiarity speeds reading; supports a familiar face.

## Unconfirmed items (human research needed)
1. Peer-reviewed effectiveness study of autosave/crash recovery.
2. Single-user "file changed on disk" reload-vs-keep study.
3. Primary sources for 4.5:1 (Arditi & Faye 2004; ISO 9241-3 text).
4. Peer-reviewed APCA vs WCAG 2 evaluation.
5. Marathe & Sundar 2011 specific results.
6. Garamond passages in Bringhurst/Beier; Wallace 2022 Garamond numbers via secondary only.
7. Version drift at build time: chokidar 5.0.0 vs v6; notify 8.2.0 vs 9.0.0-rc.5; Electron 44.8.0; pandoc 3.12.1.
