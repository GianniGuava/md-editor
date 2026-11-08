import type { CloseDecision } from '../src/preload/preload';

/**
 * The browser's replacements for native dialogs (PLAN.md §35).
 *  - saveFile: the Save / Save as dialog. A phone cannot write back to a file, so saving
 *    means handing the text to another app (Web Share with files) or downloading it
 *    (D-30). The share call runs inside the button's click so iOS treats it as a gesture.
 *  - askConfirmClose: the one confirmation this app has (D-21): Save / Don't save / Cancel.
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

/** Keep the typed name usable as a file name; fall back to the suggested extension. */
export function cleanName(typed: string, suggested: string): string {
  let name = typed.trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!name) name = suggested;
  if (!/\.[A-Za-z0-9]{1,8}$/.test(name)) {
    const ext = suggested.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '.md';
    name += ext;
  }
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

    dlg.querySelector('[data-act=download]')!.addEventListener('click', () => {
      const name = cleanName(nameInput.value, req.suggestedName);
      download(name, req.text, req.mime);
      finish({ name, via: 'download' });
    });

    dlg.querySelector('[data-act=share]')?.addEventListener('click', () => {
      const name = cleanName(nameInput.value, req.suggestedName);
      const file = new File([req.text], name, { type: req.mime });
      // No await before share(): it must run inside the click to count as a user gesture.
      navigator.share({ files: [file], title: name }).then(
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
