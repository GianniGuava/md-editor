import { createBrowserApi } from './api';
import { installCommands } from './commands';
import { claimInstance, soleInstance } from './instance';
import { createStorage } from './storage';
import { installViewport } from './viewport';

/**
 * Browser bootstrap (PLAN.md §35): install the browser MdApi as window.md, then start the
 * renderer exactly as Electron would. The renderer is imported after the bridge exists
 * because its boot() checks for window.md first, and after this copy has taken over from
 * any other open copy so it restores what that copy last wrote.
 */
const storage = createStorage();
// The newest open copy of the site takes over before anything is read (D-35).
// If storage is unusable there is nothing to coordinate; the renderer reports the failure.
const instance = await claimInstance(storage.owner).catch(() => soleInstance());
const { api, dispatch, state } = createBrowserApi({ storage, instance });
window.md = api;
installViewport();
installCommands(document.getElementById('toolbar')!, dispatch, state);
// Offline shell and cached assets (web/sw.ts); only the production build has a worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

await import('../src/renderer/index');
// Web overrides load after the renderer's own styles so they win on equal specificity.
await import('./web.css');
