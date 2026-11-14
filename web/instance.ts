/**
 * One writer at a time (PLAN.md §35, D-35). Every open copy of the site shares one
 * IndexedDB, and each would otherwise write its own tab list over the others' and prune
 * their documents (scan finding A-F2). User decision 2026-11-09: "Newest tab takes over".
 *  - A starting copy asks any running copy to hand over: the running copy writes its
 *    session, stops saving, and shows a notice with "Use MD here" (which reloads it and
 *    takes over back).
 *  - Ownership is also recorded in the database. A copy iOS froze in the background may
 *    miss the request, so every write first checks the owner and stops if it is not this
 *    copy.
 *  - Web Locks only tell a starting copy whether another copy is alive, so a lone copy
 *    starts without waiting; BroadcastChannel carries the request (both VENDOR: MDN).
 */

export interface OwnerRecord {
  get(): Promise<string | undefined>;
  set(id: string): Promise<void>;
}

export interface Instance {
  readonly id: string;
  isActive(): boolean;
  /** Check the recorded owner before a write; stops this copy if another one owns it. */
  mayWrite(): Promise<boolean>;
  /** What to do when another copy asks to take over: write the session, then resolve. */
  setHandover(fn: () => Promise<void>): void;
  onLost(cb: () => void): void;
}

const CHANNEL = 'md-instance';
const ALIVE = 'md-alive';
/** How long a starting copy waits for a running one to hand over. */
const HANDOVER_WAIT_MS = 1500;

type Message = { type: 'claim' | 'released'; id: string };

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export async function claimInstance(owner: OwnerRecord): Promise<Instance> {
  const id = newId();
  const locks = navigator.locks as LockManager | undefined;
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel(CHANNEL)
      : null;
  let active = true;
  let handover: () => Promise<void> = async () => undefined;
  const lostCallbacks: (() => void)[] = [];
  let releaseAlive: () => void = () => undefined;

  const lose = () => {
    if (!active) return;
    active = false;
    releaseAlive();
    for (const cb of lostCallbacks) cb();
  };

  // Is another copy running? Ask before holding the lock ourselves. Without Web Locks
  // there is no way to tell, so start at once and rely on the owner check.
  let othersAlive = false;
  if (locks) {
    try {
      const { held = [] } = await locks.query();
      othersAlive = held.some((l) => l.name === ALIVE);
    } catch {
      othersAlive = false;
    }
  }

  if (othersAlive && channel) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(done, HANDOVER_WAIT_MS);
      function done() {
        window.clearTimeout(timer);
        channel!.removeEventListener('message', onReply);
        resolve();
      }
      function onReply(e: MessageEvent<Message>) {
        if (e.data?.type === 'released') done();
      }
      channel!.addEventListener('message', onReply);
      channel!.postMessage({ type: 'claim', id } satisfies Message);
    });
  }
  await owner.set(id);

  if (locks) {
    void locks
      .request(
        ALIVE,
        { mode: 'shared' },
        () => new Promise<void>((resolve) => (releaseAlive = resolve)),
      )
      .catch(() => undefined);
  }

  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type !== 'claim' || e.data.id === id || !active) return;
    void handover()
      .catch(() => undefined)
      .then(() => {
        lose();
        channel.postMessage({ type: 'released', id } satisfies Message);
      });
  });

  return {
    id,
    isActive: () => active,
    async mayWrite() {
      if (!active) return false;
      if ((await owner.get()) !== id) {
        lose();
        return false;
      }
      return true;
    },
    setHandover: (fn) => (handover = fn),
    onLost: (cb) => {
      lostCallbacks.push(cb);
      if (!active) cb();
    },
  };
}

/** For a copy that coordinates with nobody (tests, or before claimInstance resolves). */
export function soleInstance(): Instance {
  return {
    id: 'sole',
    isActive: () => true,
    mayWrite: async () => true,
    setHandover: () => undefined,
    onLost: () => undefined,
  };
}
