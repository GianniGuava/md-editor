/**
 * Tab bar (PLAN.md step 3.2–3.4; D-8, D-9) with tear-off and cross-window drops.
 *  - WAI-ARIA tabs pattern: role=tablist, role=tab with aria-selected, roving tabindex,
 *    arrow keys move focus, Enter/Space activate, Delete closes.
 *  - Dirty state is never colour-only (WCAG 1.4.1): a dot glyph plus visually hidden text.
 *  - Overflow scrolls horizontally and an "All tabs" button lists every tab
 *    (Dubroy & Balakrishnan 2010: bars scroll at ~9–13 tabs and titles become unreadable;
 *    titles here keep a minimum width instead of shrinking).
 *  - Middle-click closes; drag reorders within the window; dropping a tab on another
 *    MD window moves it there; releasing it outside any window opens a new one.
 *  - The close × is a mouse affordance only: a nested focusable control would break
 *    the tabs pattern (axe nested-interactive). Keyboard users close with Delete/Ctrl+W.
 */

export interface TabInfo {
  id: string;
  name: string;
  path: string | null;
  dirty: boolean;
}

export interface TabBarCallbacks {
  onActivate(id: string): void;
  onClose(id: string): void;
  onReorder(id: string, toIndex: number): void;
  /** JSON for a cross-window drag of this tab. */
  dragPayload(id: string): string;
  /** The tab was released outside every MD window. */
  onDetach(id: string, point: { x: number; y: number }): void;
  /** A tab from another window was dropped here. */
  onReceive(payloadJson: string, sourceWindowId: number, toIndex: number): void;
}

export interface TabBarHandle {
  render(tabs: TabInfo[], activeId: string | null): void;
  focusActive(): void;
}

const MIME_TAB = 'text/x-md-tab';
const MIME_SOURCE = 'text/x-md-source';
const MIME_DOC = 'text/x-md-doc';

export function createTabBar(
  container: HTMLElement,
  windowId: number,
  cb: TabBarCallbacks,
): TabBarHandle {
  container.innerHTML = `
    <div class="tablist" role="tablist" aria-label="Open documents"></div>
    <div class="tab-overflow">
      <button type="button" class="tool" id="all-tabs" aria-haspopup="listbox"
              aria-expanded="false" title="List all open tabs" data-keys="">
        <span class="glyph" aria-hidden="true">&#8801;</span><span>All tabs</span>
      </button>
      <ul id="all-tabs-list" role="listbox" aria-label="All open tabs" hidden></ul>
    </div>`;

  const tablist = container.querySelector<HTMLElement>('.tablist')!;
  const allBtn = container.querySelector<HTMLButtonElement>('#all-tabs')!;
  const allList = container.querySelector<HTMLUListElement>('#all-tabs-list')!;

  let activeId: string | null = null;
  let tabCount = 0;

  const closeList = () => {
    allList.hidden = true;
    allBtn.setAttribute('aria-expanded', 'false');
  };

  allBtn.addEventListener('click', () => {
    const open = allList.hidden;
    allList.hidden = !open;
    allBtn.setAttribute('aria-expanded', String(open));
    if (open) allList.querySelector<HTMLElement>('[role=option]')?.focus();
  });
  allList.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeList();
      allBtn.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) closeList();
  });

  const isForeign = (dt: DataTransfer | null) =>
    !!dt &&
    dt.types.includes(MIME_DOC) &&
    Number(dt.getData(MIME_SOURCE)) !== windowId;
  const isForeignTypes = (dt: DataTransfer | null) =>
    !!dt &&
    dt.types.includes(MIME_DOC) &&
    !dt.types.includes(`${MIME_SOURCE}-${windowId}`);

  // Drop anywhere on the strip (e.g. after the last tab) from another window.
  tablist.addEventListener('dragover', (e) => {
    if (isForeignTypes(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      container.classList.add('drop-target');
    }
  });
  tablist.addEventListener('dragleave', () =>
    container.classList.remove('drop-target'),
  );
  tablist.addEventListener('drop', (e) => {
    container.classList.remove('drop-target');
    if (!isForeign(e.dataTransfer)) return;
    e.preventDefault();
    cb.onReceive(
      e.dataTransfer!.getData(MIME_DOC),
      Number(e.dataTransfer!.getData(MIME_SOURCE)),
      tabCount,
    );
  });

  function renderTab(t: TabInfo, index: number): HTMLElement {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.id = t.id;
    tab.setAttribute('aria-selected', String(t.id === activeId));
    tab.tabIndex = t.id === activeId ? 0 : -1;
    tab.draggable = true;
    tab.title = `${t.path ?? `${t.name} (not saved to disk)`}\nClose: Ctrl+W, Delete, or middle-click\nDrag out of the window to open it in a new one`;
    if (index < 9) tab.dataset.keys = `Ctrl+${index + 1}`;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = t.name;

    const dirty = document.createElement('span');
    dirty.className = 'tab-dirty';
    dirty.innerHTML = t.dirty
      ? '<span aria-hidden="true">&#9679;</span><span class="visually-hidden"> (modified)</span>'
      : '';

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.setAttribute('aria-hidden', 'true');
    close.title = 'Close (Ctrl+W, Delete, or middle-click)';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      cb.onClose(t.id);
    });

    tab.append(label, dirty, close);

    tab.addEventListener('click', () => cb.onActivate(t.id));
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        cb.onClose(t.id);
      }
    });
    tab.addEventListener('keydown', (e) => {
      const tabs = Array.from(
        tablist.querySelectorAll<HTMLElement>('[role=tab]'),
      );
      const i = tabs.indexOf(tab);
      if (e.key === 'ArrowRight') tabs[(i + 1) % tabs.length]?.focus();
      else if (e.key === 'ArrowLeft')
        tabs[(i - 1 + tabs.length) % tabs.length]?.focus();
      else if (e.key === 'Home') tabs[0]?.focus();
      else if (e.key === 'End') tabs.at(-1)?.focus();
      else if (e.key === 'Enter' || e.key === ' ') cb.onActivate(t.id);
      else if (e.key === 'Delete') cb.onClose(t.id);
      else return;
      e.preventDefault();
    });

    // Drag: reorder here, move to another window, or tear off into a new one.
    tab.addEventListener('dragstart', (e) => {
      const dt = e.dataTransfer!;
      dt.setData(MIME_TAB, t.id);
      dt.setData(MIME_SOURCE, String(windowId));
      dt.setData(`${MIME_SOURCE}-${windowId}`, '1'); // readable in dragover (types only)
      dt.setData(MIME_DOC, cb.dragPayload(t.id));
      dt.effectAllowed = 'move';
      tab.classList.add('dragging');
    });
    tab.addEventListener('dragend', (e) => {
      tab.classList.remove('dragging');
      const outside =
        e.clientX < 0 ||
        e.clientY < 0 ||
        e.clientX > window.innerWidth ||
        e.clientY > window.innerHeight;
      if (e.dataTransfer?.dropEffect === 'none' && outside) {
        cb.onDetach(t.id, { x: e.screenX, y: e.screenY });
      }
    });
    tab.addEventListener('dragover', (e) => {
      const dt = e.dataTransfer;
      if (dt && (dt.types.includes(MIME_TAB) || dt.types.includes(MIME_DOC))) {
        e.preventDefault();
        e.stopPropagation();
        dt.dropEffect = 'move';
      }
    });
    tab.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      e.preventDefault();
      e.stopPropagation();
      container.classList.remove('drop-target');
      const rect = tab.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      const toIndex = after ? index + 1 : index;
      if (isForeign(dt)) {
        cb.onReceive(
          dt.getData(MIME_DOC),
          Number(dt.getData(MIME_SOURCE)),
          toIndex,
        );
        return;
      }
      const id = dt.getData(MIME_TAB);
      if (id && id !== t.id) cb.onReorder(id, toIndex);
    });

    return tab;
  }

  return {
    render(tabs, active) {
      activeId = active;
      tabCount = tabs.length;
      tablist.replaceChildren(...tabs.map(renderTab));
      allList.replaceChildren(
        ...tabs.map((t) => {
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.tabIndex = 0;
          li.setAttribute('aria-selected', String(t.id === active));
          li.textContent = `${t.dirty ? '● ' : ''}${t.name}`;
          li.title = t.path ?? '';
          const pick = () => {
            cb.onActivate(t.id);
            closeList();
          };
          li.addEventListener('click', pick);
          li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick();
            }
          });
          return li;
        }),
      );
      tablist
        .querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      container.classList.toggle(
        'overflowing',
        tablist.scrollWidth > tablist.clientWidth,
      );
    },
    focusActive() {
      tablist.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    },
  };
}
