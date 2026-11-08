import type { AppCommandMessage, ThemePref } from '../src/preload/preload';
import type { OrientationPref } from '../src/renderer/layout';

/**
 * Commands without an application menu (PLAN.md §35, D-32). A "Menu" button at the end
 * of the toolbar opens a dialog listing every command the Electron menu offers, each with
 * its shortcut (D-16); a hardware keyboard reaches the same commands through the
 * accelerators below. Ctrl+T, Ctrl+W and Ctrl+Tab also belong to the browser and may
 * act on the browser tab instead; that is outside the page's control.
 */

export interface MenuState {
  theme: ThemePref;
  orientation: OrientationPref;
}

type Dispatch = (msg: AppCommandMessage) => void;

interface Item {
  label: string;
  name: AppCommandMessage['name'];
  keys?: string;
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
      { label: 'Find next', name: 'edit:findNext', keys: 'F3' },
      { label: 'Find previous', name: 'edit:findPrev', keys: 'Shift+F3' },
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
export function acceleratorFor(e: KeyboardEvent): AppCommandMessage | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    if (e.key === 'F3')
      return { name: e.shiftKey ? 'edit:findPrev' : 'edit:findNext' };
    return null;
  }
  const k = e.key.toLowerCase();
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
        b.innerHTML = `<span>${item.label}</span>${item.keys ? `<kbd class="keys">${item.keys}</kbd>` : ''}`;
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

  // The renderer fills the toolbar during boot; add the menu once it has.
  if (toolbar.childElementCount > 0) toolbar.appendChild(group);
  else {
    const obs = new MutationObserver(() => {
      if (toolbar.childElementCount === 0) return;
      obs.disconnect();
      toolbar.appendChild(group);
    });
    obs.observe(toolbar, { childList: true });
  }

  // Hardware keyboards: the Electron accelerators. Captured before the editor sees them.
  window.addEventListener(
    'keydown',
    (e) => {
      const msg = acceleratorFor(e);
      if (!msg) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch(msg);
    },
    true,
  );
}
