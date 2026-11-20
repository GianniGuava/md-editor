import type { CloseDecision } from '../src/preload/preload';

/**
 * The browser's replacements for native dialogs (PLAN.md §35).
 *  - saveFile: the Save / Save as dialog. A phone cannot write back to a file, so saving
 *    means handing the text to another app (Web Share with files) or downloading it
 *    (D-30). The share call runs inside the button's click so iOS treats it as a gesture.
 *  - askConfirmClose: the one confirmation this app has (D-21): Save / Don't save / Cancel.
 *  - showTakenOver: this copy of the site stopped saving because a newer one took over
 *    (D-35). It cannot be dismissed: typing here would be lost.
 */

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

export interface SaveRequest {
  suggestedName: string;
  text: string;
  mime: string;
  /** Save (not Save as): the name is shown but cannot be changed. */
  fixedName?: boolean;
  title?: string;
}

export interface SaveChoice {
  name: string;
  via: 'share' | 'download';
}

export function shareSupported(mime = 'text/markdown'): boolean {
  try {
    return (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['x'], 'x.md', { type: mime })] })
    );
  } catch {
    return false;
  }
}

/** Extensions the app writes or reads; anything else after a dot is part of the name. */
const TEXT_EXT = /\.(md|markdown|mdown|mkd|txt|html?)$/i;

/**
 * Keep the typed name usable as a file name and make sure it ends in a text extension:
 * "v1.2" or "meeting 2026.11.08" get the suggested one added (scan finding A-F9).
 */
export function cleanName(typed: string, suggested: string): string {
  let name = typed
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[. ]+$/, '');
  if (!name) name = suggested;
  if (!TEXT_EXT.test(name)) name += suggested.match(TEXT_EXT)?.[0] ?? '.md';
  return name;
}

export function download(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function saveFile(req: SaveRequest): Promise<SaveChoice | null> {
  return new Promise((resolve) => {
    const canShare = shareSupported(req.mime);
    const dlg = document.createElement('dialog');
    dlg.className = 'web-dialog';
    dlg.setAttribute('aria-labelledby', 'save-title');
    dlg.innerHTML = `
      <form method="dialog" class="web-form">
        <h2 id="save-title">${esc(req.title ?? 'Save')}</h2>
        <p class="web-hint">Nothing is kept on a server. Share hands the file to another app
          (Files, Mail, Notes…); Download puts it in this browser's downloads.</p>
        <label for="save-name">File name</label>
        <input id="save-name" type="text" value="${esc(req.suggestedName)}"
               ${req.fixedName ? 'readonly' : ''} autocomplete="off" autocapitalize="off" spellcheck="false">
        <p id="save-status" class="web-status" role="status" aria-live="polite"></p>
        <div class="web-actions">
          <button type="button" class="tool" data-act="cancel">Cancel</button>
          <button type="button" class="tool${canShare ? '' : ' primary'}" data-act="download">Download</button>
          ${canShare ? '<button type="button" class="tool primary" data-act="share">Share…</button>' : ''}
        </div>
      </form>`;
    document.body.appendChild(dlg);

    const nameInput = dlg.querySelector<HTMLInputElement>('#save-name')!;
    const status = dlg.querySelector<HTMLElement>('#save-status')!;
    let settled = false;
    const finish = (choice: SaveChoice | null) => {
      if (settled) return;
      settled = true;
      dlg.close();
      dlg.remove();
      resolve(choice);
    };
    dlg.addEventListener('close', () => finish(null));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });

    dlg
      .querySelector('[data-act=cancel]')!
      .addEventListener('click', () => finish(null));
    // Return in the name field (the phone keyboard's Go key) submits the form, which would
    // close the dialog without saving; run the primary action instead (finding A-F8). The
    // key press counts as the user gesture Share needs.
    dlg.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.querySelector<HTMLButtonElement>('.tool.primary')?.click();
    });

    dlg.querySelector('[data-act=download]')!.addEventListener('click', () => {
      const name = cleanName(nameInput.value, req.suggestedName);
      download(name, req.text, req.mime);
      finish({ name, via: 'download' });
    });

    dlg.querySelector('[data-act=share]')?.addEventListener('click', () => {
      const name = cleanName(nameInput.value, req.suggestedName);
      const file = new File([req.text], name, { type: req.mime });
      // No await before share(): it must run inside the click to count as a user gesture.
      // Files only: iOS "Save to Files" also saved a title or text as its own text.txt
      // (phone test 2026-11-20: "text.txt" containing "test.md" next to test.md).
      navigator.share({ files: [file] }).then(
        () => finish({ name, via: 'share' }),
        (err: unknown) => {
          const e = err as Error;
          status.textContent =
            e?.name === 'AbortError'
              ? 'Share cancelled.'
              : `Share failed (${e?.message ?? 'unknown error'}). Try Download.`;
        },
      );
    });

    dlg.showModal();
    if (!req.fixedName) {
      nameInput.focus();
      const dot = nameInput.value.lastIndexOf('.');
      nameInput.setSelectionRange(0, dot > 0 ? dot : nameInput.value.length);
    } else {
      dlg.querySelector<HTMLButtonElement>('.tool.primary')?.focus();
    }
  });
}

export function askConfirmClose(name: string): Promise<CloseDecision> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'web-dialog';
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.innerHTML = `
      <form method="dialog" class="web-form">
        <h2 id="confirm-title">Save changes?</h2>
        <p>“${esc(name)}” has changes that exist only in this tab. Share or download it before closing?</p>
        <div class="web-actions">
          <button type="button" class="tool" data-act="cancel">Cancel</button>
          <button type="button" class="tool" data-act="discard">Don't save</button>
          <button type="button" class="tool primary" data-act="save">Save…</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    let settled = false;
    const finish = (d: CloseDecision) => {
      if (settled) return;
      settled = true;
      dlg.close();
      dlg.remove();
      resolve(d);
    };
    dlg.addEventListener('close', () => finish('cancel'));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish('cancel');
    });
    for (const d of ['cancel', 'discard', 'save'] as CloseDecision[]) {
      dlg
        .querySelector(`[data-act=${d}]`)!
        .addEventListener('click', () => finish(d));
    }
    dlg.showModal();
    dlg.querySelector<HTMLButtonElement>('[data-act=save]')!.focus();
  });
}

export function showTakenOver(): void {
  if (document.getElementById('taken-over')) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'web-dialog';
  dlg.id = 'taken-over';
  dlg.setAttribute('aria-labelledby', 'taken-title');
  dlg.setAttribute('aria-describedby', 'taken-text');
  dlg.innerHTML = `
    <div class="web-form">
      <h2 id="taken-title">MD is open in another tab</h2>
      <p id="taken-text">This tab has stopped saving, so the two cannot overwrite each other's
        work. Your documents are in the other tab. To work here instead, use MD here: this tab
        reloads with everything the other tab saved.</p>
      <div class="web-actions">
        <button type="button" class="tool primary" data-act="here">Use MD here</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('cancel', (e) => e.preventDefault());
  dlg
    .querySelector('[data-act=here]')!
    .addEventListener('click', () => window.location.reload());
  // Above any dialog already open (Save, Menu): the newest modal is on top.
  dlg.showModal();
  dlg.querySelector<HTMLButtonElement>('[data-act=here]')!.focus();
}
