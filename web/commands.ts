import type { AppCommandMessage, ThemePref } from '../src/preload/preload';
import type { OrientationPref } from '../src/renderer/layout';

/**
 * Commands without an application menu (PLAN.md §35, D-32). A "Menu" button at the end
 * of the toolbar opens a dialog listing every command the Electron menu offers, each with
 * its shortcut (D-16); a hardware keyboard reaches the same commands through the
 * accelerators below. Ctrl+T, Ctrl+W and Ctrl+Tab also belong to the browser and may
 * act on the browser tab instead; that is outside the page's control.
 * Platform (notebook shortcut-conventions; Apple, "Mac keyboard shortcuts"): on Apple
 * devices the modifier is Command and Control is left to text editing (Control+E, +H,
 * +T are editing keys there); elsewhere it is Control. Next/previous tab is Control+Tab
 * on both, as in Safari. Find next/previous is Command+G on Apple devices, F3 elsewhere.
 */

/** iPhone, iPad (which reports itself as a Mac) and Mac. */
export const isApple = (): boolean =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Show a shortcut as the platform writes it: "⇧⌘S" on Apple devices, "Ctrl+Shift+S" elsewhere. */
export function formatKeys(keys: string, apple: boolean): string {
  if (!apple) return keys;
  const parts = keys.split(/\+(?=.)/);
  const last = parts.pop()!;
  const mods = new Set(parts);
  const control = mods.has('Ctrl') && last === 'Tab';
  return `${control ? '⌃' : ''}${mods.has('Shift') ? '⇧' : ''}${mods.has('Ctrl') && !control ? '⌘' : ''}${last}`;
}

export interface MenuState {
  theme: ThemePref;
  orientation: OrientationPref;
}

type Dispatch = (msg: AppCommandMessage) => void;

interface Item {
  label: string;
  name: AppCommandMessage['name'];
  keys?: string;
  /** Where the Apple shortcut is a different key, not just a different modifier. */
  appleKeys?: string;
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'File',
    items: [
      { label: 'New tab', name: 'file:new', keys: 'Ctrl+T' },
      { label: 'Import file…', name: 'file:open', keys: 'Ctrl+O' },
      { label: 'Save (share or download)', name: 'file:save', keys: 'Ctrl+S' },
      { label: 'Save as…', name: 'file:saveAs', keys: 'Ctrl+Shift+S' },
      { label: 'Close tab', name: 'tab:close', keys: 'Ctrl+W' },
      { label: 'Reopen closed tab', name: 'tab:reopen', keys: 'Ctrl+Shift+T' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Find…', name: 'edit:find', keys: 'Ctrl+F' },
      {
        label: 'Find next',
        name: 'edit:findNext',
        keys: 'F3',
        appleKeys: 'Ctrl+G',
      },
      {
        label: 'Find previous',
        name: 'edit:findPrev',
        keys: 'Shift+F3',
        appleKeys: 'Ctrl+Shift+G',
      },
      { label: 'Replace…', name: 'edit:replace', keys: 'Ctrl+H' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Editor only', name: 'mode:editor', keys: 'Ctrl+Shift+E' },
      { label: 'Split', name: 'mode:split', keys: 'Ctrl+\\' },
      { label: 'Preview only', name: 'mode:preview', keys: 'Ctrl+Shift+P' },
      { label: 'Next tab', name: 'tab:next', keys: 'Ctrl+Tab' },
      { label: 'Previous tab', name: 'tab:prev', keys: 'Ctrl+Shift+Tab' },
      { label: 'Cycle theme', name: 'theme:cycle', keys: 'Ctrl+Shift+L' },
      { label: 'Zoom in', name: 'zoom:in', keys: 'Ctrl+=' },
      { label: 'Zoom out', name: 'zoom:out', keys: 'Ctrl+-' },
      { label: 'Reset zoom', name: 'zoom:reset', keys: 'Ctrl+0' },
    ],
  },
  {
    label: 'Export',
    items: [{ label: 'Export…', name: 'export:open', keys: 'Ctrl+E' }],
  },
  {
    label: 'Help',
    items: [
      { label: 'Open sample document', name: 'file:sample' },
      { label: 'About MD', name: 'help:about' },
    ],
  },
];

const LAYOUTS: [string, OrientationPref][] = [
  ['Automatic', 'auto'],
  ['Side by side', 'columns'],
  ['Stacked', 'rows'],
];
const THEMES: [string, ThemePref][] = [
  ['Light', 'light'],
  ['Dark', 'dark'],
  ['High contrast', 'hc'],
  ['System', 'system'],
];

/** Map a key event to the command its Electron accelerator would send; null if none. */
export function acceleratorFor(
  e: KeyboardEvent,
  apple: boolean = isApple(),
): AppCommandMessage | null {
  if (e.altKey) return null;
  if (e.key === 'Tab' && e.ctrlKey && !e.metaKey)
    return { name: e.shiftKey ? 'tab:prev' : 'tab:next' };
  const mod = apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod) {
    if (e.key === 'F3' && !e.ctrlKey && !e.metaKey)
      return { name: e.shiftKey ? 'edit:findPrev' : 'edit:findNext' };
    return null;
  }
  const k = e.key.toLowerCase();
  if (apple && k === 'g')
    return { name: e.shiftKey ? 'edit:findPrev' : 'edit:findNext' };
  if (k === '=' || k === '+') return { name: 'zoom:in' };
  if (k === '-' || k === '_') return { name: 'zoom:out' };
  if (e.shiftKey) {
    const shifted: Record<string, AppCommandMessage['name']> = {
      s: 'file:saveAs',
      t: 'tab:reopen',
      e: 'mode:editor',
      p: 'mode:preview',
      l: 'theme:cycle',
    };
    return shifted[k] ? { name: shifted[k] } : null;
  }
  const plain: Record<string, AppCommandMessage['name']> = {
    t: 'file:new',
    o: 'file:open',
    s: 'file:save',
    w: 'tab:close',
    f: 'edit:find',
    h: 'edit:replace',
    '\\': 'mode:split',
    '0': 'zoom:reset',
    e: 'export:open',
  };
  return plain[k] ? { name: plain[k] } : null;
}

function toolButton(label: string, glyph: string, title: string, keys = '') {
  const b = document.createElement('button');
  b.className = 'tool';
  b.type = 'button';
  b.title = keys ? `${title} (${keys})` : title;
  b.dataset.keys = keys;
  b.innerHTML = `<span class="glyph" aria-hidden="true">${glyph}</span><span>${label}</span>`;
  return b;
}

export function installCommands(
  toolbar: HTMLElement,
  dispatch: Dispatch,
  state: MenuState,
): void {
  const apple = isApple();
  const dlg = document.createElement('dialog');
  dlg.className = 'web-dialog web-menu';
  dlg.id = 'menu-dialog';
  dlg.setAttribute('aria-labelledby', 'menu-title');
  document.body.appendChild(dlg);

  const radioRow = <T extends string>(
    label: string,
    options: [string, T][],
    current: T,
    pick: (value: T) => void,
  ) => {
    const wrap = document.createElement('div');
    wrap.className = 'web-menu-radio';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', label);
    const lab = document.createElement('span');
    lab.className = 'web-menu-radio-label';
    lab.textContent = label;
    wrap.appendChild(lab);
    for (const [text, value] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.textContent = text;
      b.setAttribute('aria-pressed', String(value === current));
      b.addEventListener('click', () => {
        pick(value);
        dlg.close();
      });
      wrap.appendChild(b);
    }
    return wrap;
  };

  const render = () => {
    dlg.innerHTML = `
      <form method="dialog" class="web-form">
        <h2 id="menu-title">Menu</h2>
        <div id="menu-groups"></div>
        <div class="web-actions"><button type="submit" class="tool">Close</button></div>
      </form>`;
    const groups = dlg.querySelector<HTMLElement>('#menu-groups')!;
    for (const g of GROUPS) {
      const sec = document.createElement('section');
      const hid = `menu-${g.label.toLowerCase()}`;
      sec.setAttribute('aria-labelledby', hid);
      const h = document.createElement('h3');
      h.id = hid;
      h.textContent = g.label;
      sec.appendChild(h);
      for (const item of g.items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool web-menu-item';
        const keys = apple ? (item.appleKeys ?? item.keys) : item.keys;
        b.innerHTML = `<span>${item.label}</span>${keys ? `<kbd class="keys">${formatKeys(keys, apple)}</kbd>` : ''}`;
        b.addEventListener('click', () => {
          dlg.close();
          dispatch({ name: item.name });
        });
        sec.appendChild(b);
      }
      if (g.label === 'View') {
        sec.appendChild(
          radioRow('Layout', LAYOUTS, state.orientation, (value) =>
            dispatch({ name: 'layout:set', value }),
          ),
        );
        sec.appendChild(
          radioRow('Theme', THEMES, state.theme, (value) =>
            dispatch({ name: 'theme:set', value }),
          ),
        );
      }
      groups.appendChild(sec);
    }
  };

  const menuBtn = toolButton('Menu', '⋯', 'All commands');
  menuBtn.id = 'menu-button';
  menuBtn.setAttribute('aria-haspopup', 'dialog');
  menuBtn.addEventListener('click', () => {
    render();
    dlg.showModal();
  });
  const group = document.createElement('div');
  group.className = 'toolbar-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Menu');
  group.appendChild(menuBtn);

  // The renderer fills the toolbar during boot; add the menu once it has, and on Apple
  // devices show the toolbar's shortcuts with Command.
  const finishToolbar = () => {
    toolbar.appendChild(group);
    if (!apple) return;
    for (const b of toolbar.querySelectorAll<HTMLElement>('[data-keys]')) {
      const keys = b.dataset.keys;
      if (keys && b.title.endsWith(`(${keys})`))
        b.title = `${b.title.slice(0, -keys.length - 2)}(${formatKeys(keys, true)})`;
    }
  };
  if (toolbar.childElementCount > 0) finishToolbar();
  else {
    const obs = new MutationObserver(() => {
      if (toolbar.childElementCount === 0) return;
      obs.disconnect();
      finishToolbar();
    });
    obs.observe(toolbar, { childList: true });
  }

  // Hardware keyboards: the Electron accelerators. Captured before the editor sees them.
  // While a dialog is open the key does nothing (no second Save dialog, no tab behind a
  // modal), and a held key fires once, except zoom (scan finding B-F3).
  window.addEventListener(
    'keydown',
    (e) => {
      const msg = acceleratorFor(e, apple);
      if (!msg) return;
      e.preventDefault();
      e.stopPropagation();
      if (document.querySelector('dialog[open]')) return;
      if (e.repeat && msg.name !== 'zoom:in' && msg.name !== 'zoom:out') return;
      dispatch(msg);
    },
    true,
  );
}
