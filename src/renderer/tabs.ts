/**
 * Tab bar (PLAN.md step 3.2–3.4; D-8, D-9).
 *  - WAI-ARIA tabs pattern: role=tablist, role=tab with aria-selected, roving tabindex,
 *    arrow keys move focus, Enter/Space activate, Delete closes.
 *  - Dirty state is never colour-only (WCAG 1.4.1): a dot glyph plus visually hidden text.
 *  - Overflow scrolls horizontally and an "All tabs" button lists every tab
 *    (Dubroy & Balakrishnan 2010: bars scroll at ~9–13 tabs and titles become unreadable;
 *    titles here keep a minimum width instead of shrinking).
 *  - Middle-click closes; drag and drop reorders.
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
}

export interface TabBarHandle {
  render(tabs: TabInfo[], activeId: string | null): void;
  focusActive(): void;
}

export function createTabBar(
  container: HTMLElement,
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

  function renderTab(t: TabInfo, index: number): HTMLElement {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.id = t.id;
    tab.setAttribute('aria-selected', String(t.id === activeId));
    tab.tabIndex = t.id === activeId ? 0 : -1;
    tab.draggable = true;
    tab.title = `${t.path ?? `${t.name} (not saved to disk)`}
Close: Ctrl+W, Delete, or middle-click`;
    if (index < 9) tab.dataset.keys = `Ctrl+${index + 1}`;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = t.name;

    const dirty = document.createElement('span');
    dirty.className = 'tab-dirty';
    dirty.innerHTML = t.dirty
      ? '<span aria-hidden="true">&#9679;</span><span class="visually-hidden"> (modified)</span>'
      : '';

    // Mouse affordance only: a nested focusable control would violate the ARIA
    // tabs pattern (axe nested-interactive / aria-required-children). Keyboard and
    // screen-reader users close with Delete (handled below), Ctrl+W, or middle-click.
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

    // Drag to reorder
    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/x-md-tab', t.id);
      e.dataTransfer!.effectAllowed = 'move';
      tab.classList.add('dragging');
    });
    tab.addEventListener('dragend', () => tab.classList.remove('dragging'));
    tab.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('text/x-md-tab')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    tab.addEventListener('drop', (e) => {
      const id = e.dataTransfer?.getData('text/x-md-tab');
      if (!id || id === t.id) return;
      e.preventDefault();
      const rect = tab.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      cb.onReorder(id, after ? index + 1 : index);
    });

    return tab;
  }

  return {
    render(tabs, active) {
      activeId = active;
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
      // Keep the active tab in view when the bar overflows.
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
