import './styles/base.css';

/**
 * Renderer entry. Step 1 only proves the pipeline: tokens applied, bridge reachable,
 * theme attribute set. Editor, tabs and panes arrive in steps 2 and 3.
 */
async function boot(): Promise<void> {
  // The Vite dev server is also reachable from an ordinary browser (and from the
  // Claude desktop app's preview probe); outside Electron there is no bridge.
  if (!window.md) {
    const status = document.getElementById('status');
    if (status)
      status.textContent =
        'Open this page inside the MD app (no bridge found).';
    return;
  }
  const info = await window.md.getInfo();
  console.log('[md] renderer bridge ok', JSON.stringify(info));

  // Light is the default (D-10); "system" resolution comes with step 5's theme service.
  document.documentElement.dataset.theme = 'light';

  const status = document.getElementById('status');
  if (status) {
    status.textContent = `${info.name} ${info.version} · Electron ${info.electron} · system theme: ${info.systemTheme}`;
  }
}

void boot();
