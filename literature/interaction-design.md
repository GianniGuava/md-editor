# Citation verification: interaction design

Checked 2026-10-16 by a research agent. Every DOI marked "confirmed" was resolved on a live page (Crossref, OpenAlex, publisher/author page, PMC, W3C). Full-text PDFs could not be parsed, so numbers come from live abstracts/author pages unless noted.

## Item 1 — Click-target size and spacing (mouse)

- **Fitts, P. M. (1954).** The information capacity of the human motor system in controlling the amplitude of movement. *Journal of Experimental Psychology, 47*(6), 381–391. https://doi.org/10.1037/h0055392 — Confirmed (Crossref). Journal. Movement time grows with log2(2A/W): smaller, farther targets are slower. A law, not a pixel threshold.
- **MacKenzie, I. S. (1992).** Fitts' law as a research and design tool in human-computer interaction. *Human-Computer Interaction, 7*(1), 91–139. https://doi.org/10.1207/s15327051hci0701_3 — Confirmed (OpenAlex + yorku.ca/mack). Journal. Shannon formulation ID = log2(A/W + 1); Fitts' law as a design tool.
- **Soukoreff, R. W., & MacKenzie, I. S. (2004).** Towards a standard for pointing device evaluation. *IJHCS, 61*(6), 751–789. https://doi.org/10.1016/j.ijhcs.2004.09.001 — Confirmed. Journal. Methodology; contains NO minimum physical target size.
- **Grossman, T., & Balakrishnan, R. (2005).** The bubble cursor. *CHI 2005*, 281–290. https://doi.org/10.1145/1054972.1055012 — Confirmed. Conference. Small/sparse targets carry a real pointing cost.
- **Chapuis, O., & Dragicevic, P. (2011).** Effects of motor scale, visual scale and quantization on small target acquisition difficulty. *ACM TOCHI, 18*(3), 13. https://doi.org/10.1145/1993060.1993063 — Confirmed. Journal. Both motor and visual size limit small-target acquisition; gives a model, not a pixel minimum.
- Peer-reviewed minimum px/mm mouse target size: **NOT FOUND — human research needed.**
- STANDARD: WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA: ≥24×24 CSS px or equivalent spacing. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

## Item 2 — Tabbed documents

- **Dubroy, P., & Balakrishnan, R. (2010).** A study of tabbed browsing among Mozilla Firefox users. *CHI 2010*, 673–682. https://doi.org/10.1145/1753326.1753426 — Confirmed (OpenAlex; author blog dubroy.com). Conference. 21 participants, 13–21 days of logs. 20/21 preferred tabs over windows; 17/21 used tabs as reminders, 14/21 for parallel work; 16/21 switched tabs more often than they used Back. Median open tabs ≤6 for most; max 42. Tab bar begins scrolling at ~9–13 tabs on 1280×1024; heavy users reported unreadable titles and duplicates.
- **Huang, J., & White, R. W. (2010).** Parallel browsing behavior on the web. *HT '10*, 13–18. https://doi.org/10.1145/1810617.1810622 — Confirmed. Conference. Millions of users; tab switching follows a power law; users switch tabs ≥57.4% of the time.
- **Chang, J. C., et al. (2021).** When the tab comes due: Challenges in the cost structure of browser tab usage. *CHI 2021*. https://doi.org/10.1145/3411764.3445585 — Confirmed. Conference. Pressures to keep tabs (reminder, fear of loss) vs close (limited attention). "25% crashes" figure is press coverage, secondary.
- Numeric tab-count performance threshold: **NOT FOUND.** Tab placement top vs side: **NOT FOUND — human research needed.**

## Item 3 — Keyboard shortcuts vs menus/toolbars

- **Lane, D. M., Napier, H. A., Peres, S. C., & Sándor, A. (2005).** Hidden costs of graphical user interfaces. *International Journal of Human-Computer Interaction, 18*(2), 133–144. https://doi.org/10.1207/s15327590ijhc1802_1 — Confirmed. Journal. 251 experienced Word users rarely used shortcuts despite shortcuts being fastest; adoption does not happen on its own.
- **Peres, S. C., et al. (2004).** Keyboard shortcut usage: The roles of social factors and computer experience. *HFES Annual Meeting, 48*(5), 803–807. https://doi.org/10.1177/154193120404800513 — Confirmed. Conference. Shortcuts take roughly half the time of mouse methods; use predicted by social exposure.
- **Grossman, T., Dragicevic, P., & Balakrishnan, R. (2007).** Strategies for accelerating on-line learning of hotkeys. *CHI 2007*, 1591–1600. https://doi.org/10.1145/1240624.1240865 — Confirmed. Conference. Small modifications to menu feedback significantly accelerated hotkey learning. Winning techniques not named here (full text unread).
- **Malacria, S., Bailly, G., Harrison, J., Cockburn, A., & Gutwin, C. (2013).** Promoting hotkey use through rehearsal with ExposeHK. *CHI 2013*, 573–582. https://doi.org/10.1145/2470654.2470735 — Confirmed (Crossref + HAL). Conference. Overlaying hotkeys on commands while a modifier is held increased and accelerated hotkey use across toolbar, menu and ribbon.
- **Cockburn, A., Gutwin, C., Scarr, J., & Malacria, S. (2014).** Supporting novice to expert transitions in user interfaces. *ACM Computing Surveys, 47*(2), 1–36. https://doi.org/10.1145/2659796 — DOI seen on OpenAlex; abstract not read. Umbrella survey.

## Item 4 — Spacing and grouping

- **Wertheimer, M. (1923).** Untersuchungen zur Lehre von der Gestalt. II. *Psychologische Forschung, 4*, 301–350. https://doi.org/10.1007/BF00410640 — Confirmed. Journal. English abridged: Wertheimer (1938) in Ellis (Ed.), *A source book of Gestalt psychology*, 71–88; https://psychclassics.yorku.ca/Wertheimer/Forms/forms.htm. Proximity principle.
- **Wagemans, J., et al. (2012).** A century of Gestalt psychology in visual perception: I. *Psychological Bulletin, 138*(6), 1172–1217. https://doi.org/10.1037/a0029333 — Confirmed (PMID 22845751). Journal review. Proximity grouping empirically robust.
- **Niemelä, M., & Saarinen, J. (2000).** Visual search for grouped versus ungrouped icons in a computer interface. *Human Factors, 42*(4), 630–635. https://doi.org/10.1518/001872000779697999 — Confirmed. Journal. Spatial grouping significantly sped visual search. n=14 from a secondary source.
- 8-px spacing grid: **NOT FOUND — human research needed** (practitioner convention only).

## Item 5 — Icons alone vs icons + labels

- **Wiedenbeck, S. (1999).** The use of icons and labels in an end user application program. *Behaviour & Information Technology, 18*(2), 68–82. https://doi.org/10.1080/014492999119129 — Confirmed. Journal. Icon-only markedly worse for novices on time and help use; icon+label rated easiest throughout.
- **Kacmar, C. J., & Carey, J. M. (1991).** Assessing the usability of icons in user interfaces. *Behaviour & Information Technology, 10*(6), 443–457. https://doi.org/10.1080/01449299108924303 — Confirmed (note DOI ends ...303). Journal. Text+icon produced fewest incorrect selections; no speed difference.
- Later replication: **NOT FOUND.**

## Item 6 — Split-pane preview vs WYSIWYG

- **Knauff, M., & Nejasmic, J. (2014).** An efficiency comparison of document preparation systems used in academic research and development. *PLoS ONE, 9*(12), e115069. https://doi.org/10.1371/journal.pone.0115069 — Confirmed (PMC4272305). Journal. 40 researchers; LaTeX users slower and more error-prone than Word users, but reported more enjoyment. Post-publication critique (Wilke, blog) says the task favoured WYSIWYG. Indirect: compile-and-view, not live preview.
- Direct split-pane vs WYSIWYG vs toggle comparison: **NOT FOUND — human research needed.**

## Item 7 — Undo

- **Abowd, G. D., & Dix, A. J. (1992).** Giving undo attention. *Interacting with Computers, 4*(3), 317–342. https://doi.org/10.1016/0953-5438(92)90021-7 — Confirmed. Journal. Undo as a user intention to support; formal semantics.
- **Berlage, T. (1994).** A selective undo mechanism for graphical user interfaces based on command objects. *ACM TOCHI, 1*(3), 269–294. https://doi.org/10.1145/196699.196721 — Confirmed. Journal. Limits of linear undo; selective undo via command objects.
- **Yoon, Y., & Myers, B. A. (2015).** Supporting selective undo in a code editor. *ICSE 2015*, 223–233. https://doi.org/10.1109/ICSE.2015.43 — Confirmed. Conference. Programmers ~2× faster on backtracking with selective undo. No equivalent prose-editor study: linear vs tree undo for text **flag for review**.

## Item 8 — Confirmation dialogs and habituation

- **Böhme, R., & Köpsell, S. (2010).** Trained to accept? *CHI 2010*, 2403–2406. https://doi.org/10.1145/1753326.1753689 — Confirmed. ~80,000 users; EULA-like dialogs accepted more readily.
- **Egelman, S., Cranor, L. F., & Hong, J. (2008).** You've been warned. *CHI 2008*, 1065–1074. https://doi.org/10.1145/1357054.1357219 — Confirmed. 79% heeded active warnings; passive largely ignored.
- **Bravo-Lillo, C., et al. (2013).** Your attention please. *SOUPS 2013*. DOI 10.1145/2501604.2501610 — citation confirmed on Microsoft Research page; DOI from citing lists only, **verify**. Inhibitive attractors 2–3× more informed decisions after habituation.
- **Anderson, B. B., et al. (2015).** How polymorphic warnings reduce habituation in the brain. *CHI 2015*, 2883–2892. https://doi.org/10.1145/2702123.2702322 — Confirmed. Visual-processing activity drops by second exposure.
- **Vance, A., et al. (2018).** Tuning out security warnings. *MIS Quarterly, 42*(2), 355–380. https://doi.org/10.25300/MISQ/2018/14124 — Confirmed. ~80% adherence with polymorphic vs ~55% static.
- **Akhawe, D., & Felt, A. P. (2013).** Alice in Warningland. *USENIX Security 2013*. https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe — Confirmed. Click-through 10–70% by warning type.
- Caveat: all test security/consent dialogs; the editor inference (avoid routine confirmations; keep one distinctive prompt for unsaved-work loss) is by analogy. **Flag for review.**

## Item 9 — Focus indicators

- Peer-reviewed focus-indicator experiment: **NOT FOUND — human research needed.**
- STANDARDS (confirmed on w3.org): WCAG 2.2 SC 2.4.7 Focus Visible (AA); SC 2.4.13 Focus Appearance (AAA): ≥2 CSS px perimeter, ≥3:1 between focused/unfocused states. SC 2.4.11 Focus Not Obscured (Minimum) wording not fetched this run.
- **Power, C., Freire, A., Petrie, H., & Swallow, D. (2012).** Guidelines are only half of the story. *CHI 2012*, 433–442. https://doi.org/10.1145/2207676.2207736 — Confirmed. Only 50.4% of 1,383 blind-user problems were covered by WCAG 2.0; compliance necessary but not sufficient.

## Item 10 — Scroll synchronisation

**NOT FOUND — human research needed.** Only a SciPy 2022 tool paper (Codebraid Preview) mentions it as a feature.

## Unconfirmed / flagged
- Bravo-Lillo 2013 DOI unverified by resolver.
- Grossman 2007 winning techniques not named.
- Niemelä & Saarinen n=14 secondary.
- Chang 2021 "25% crashes" secondary.
- WCAG 2.4.11 wording not fetched.
- NOT FOUND: mouse minimum target size; tab-count threshold; tab placement; 8-px grid; icon-label replication after 1999; split-pane vs WYSIWYG; linear vs tree undo for text; focus-indicator experiment; scroll-sync research.
