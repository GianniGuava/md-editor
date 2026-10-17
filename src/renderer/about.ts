import logoSvg from '../../assets/logo.svg?raw';

/** Help › About: logo (outlined EB Garamond, D-24), version, licences. */
export function createAboutDialog(info: {
  name: string;
  version: string;
  electron: string;
}): { open(): void } {
  const dlg = document.createElement('dialog');
  dlg.id = 'about-dialog';
  dlg.setAttribute('aria-labelledby', 'about-title');
  dlg.innerHTML = `
    <form method="dialog" class="about-form">
      <div class="about-logo" aria-hidden="true">${logoSvg}</div>
      <h2 id="about-title">${info.name}</h2>
      <p>Version ${info.version} · Electron ${info.electron}</p>
      <p class="about-small">Logo set in EB Garamond, SIL Open Font License 1.1.
        Editor: CodeMirror 6. Preview: markdown-it and DOMPurify.</p>
      <button type="submit" class="tool primary" autofocus>Close</button>
    </form>`;
  document.body.appendChild(dlg);
  return { open: () => dlg.showModal() };
}
