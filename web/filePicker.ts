/**
 * Import: the browser's file chooser (PLAN.md §35, D-29). iOS Safari has no File System
 * Access API, so a chosen file is read once and copied; the original is never written.
 */
const ACCEPT = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';

export function pickFiles(): Promise<File[]> {
  for (const stale of document.querySelectorAll('[data-role=import-input]'))
    stale.remove();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.hidden = true;
    input.setAttribute('aria-hidden', 'true');
    input.dataset.role = 'import-input';
    document.body.appendChild(input);

    let done = false;
    const finish = (files: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () =>
      finish(Array.from(input.files ?? [])),
    );
    input.addEventListener('cancel', () => finish([]));
    // Engines without the cancel event: if files are there a moment after the page regains
    // focus, take them. Never give up on an empty chooser, because a file still being
    // fetched (iCloud) arrives later through "change" (scan finding A-F10). A chooser
    // cancelled without a cancel event just stays pending; the next Open clears it.
    window.addEventListener(
      'focus',
      () =>
        window.setTimeout(() => {
          if (input.files?.length) finish(Array.from(input.files));
        }, 1000),
      { once: true },
    );
    input.click();
  });
}
