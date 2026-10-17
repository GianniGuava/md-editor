/**
 * Non-modal banners between the toolbar and the workspace (PLAN.md step 4.3; D-18, D-21).
 * They never block typing: CITED Brun et al. 2011 (warn without interrupting),
 * Dourish & Bellotti 1992 (passive awareness). Each banner is a polite live region
 * with labelled buttons; Escape dismisses the focused banner.
 */
export interface BannerAction {
  label: string;
  primary?: boolean;
  run: () => void | Promise<void>;
}

export interface BannerSpec {
  /** Replacing key: a new banner with the same key replaces the old one. */
  key: string;
  message: string;
  actions: BannerAction[];
  /** Optional extra content (e.g. a diff) rendered below the message. */
  detail?: HTMLElement;
  tone?: 'info' | 'danger';
}

export interface BannersHandle {
  show(spec: BannerSpec): void;
  dismiss(key: string): void;
  dismissWhere(predicate: (key: string) => boolean): void;
}

export function createBanners(container: HTMLElement): BannersHandle {
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Notices');

  const byKey = new Map<string, HTMLElement>();

  const dismiss = (key: string) => {
    byKey.get(key)?.remove();
    byKey.delete(key);
  };

  return {
    show(spec) {
      dismiss(spec.key);
      const el = document.createElement('div');
      el.className = `banner banner-${spec.tone ?? 'info'}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.tabIndex = -1;

      const msg = document.createElement('p');
      msg.className = 'banner-message';
      msg.textContent = spec.message;

      const actions = document.createElement('div');
      actions.className = 'banner-actions';
      for (const a of spec.actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tool${a.primary ? ' primary' : ''}`;
        b.textContent = a.label;
        b.addEventListener('click', () => void a.run());
        actions.appendChild(b);
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tool';
      close.setAttribute('aria-label', 'Dismiss notice');
      close.textContent = '×';
      close.addEventListener('click', () => dismiss(spec.key));
      actions.appendChild(close);

      el.append(msg, actions);
      if (spec.detail) el.appendChild(spec.detail);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dismiss(spec.key);
      });

      container.appendChild(el);
      byKey.set(spec.key, el);
    },
    dismiss,
    dismissWhere(pred) {
      for (const key of Array.from(byKey.keys())) if (pred(key)) dismiss(key);
    },
  };
}
