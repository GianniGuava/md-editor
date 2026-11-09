import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import type { FileData, ThemePref } from '../src/preload/preload';
import type {
  SessionData,
  SessionWindowData,
  WindowReport,
} from '../src/main/session';
import { hashText, type Eol } from './text';

/**
 * Browser stand-ins for %APPDATA%\MD (PLAN.md §35; D-29, D-30).
 *  - files: the web "disk". A record appears when a document is imported or shared, so
 *    Save, dirty tracking and session restore in the renderer run unchanged. Records
 *    no open or recently closed tab refers to are pruned when the session is written:
 *    there is no library (api.ts decides what to keep).
 *  - session: this window's entry plus the theme; drafts keyed by draft id (D-23).
 * Everything is IndexedDB on this device (idb-keyval, VENDOR); nothing leaves the phone.
 */

export interface StoredFile {
  name: string;
  text: string;
  mtimeMs: number;
  eol: Eol;
}

export interface Storage {
  files: {
    read(path: string): Promise<FileData>;
    write(
      path: string,
      name: string,
      text: string,
      eol: Eol,
    ): Promise<FileData>;
    exists(path: string): Promise<boolean>;
    /** "Folder/name.md", then "Folder/name (2).md", … the first path not in use. */
    uniquePath(folder: string, name: string): Promise<string>;
    /** Remove every record whose path is not in `keep`. */
    prune(keep: Iterable<string>): Promise<void>;
  };
  session: {
    load(): Promise<{
      theme: SessionData['theme'];
      window: SessionWindowData | null;
    }>;
    save(report: WindowReport): Promise<void>;
    setTheme(pref: ThemePref): Promise<void>;
    writeDraft(id: string, text: string): Promise<void>;
    readDraft(id: string): Promise<string | null>;
    deleteDraft(id: string): Promise<void>;
    /** Remove every draft whose id is not in `keep` (the desktop prunes at start-up, D-23). */
    pruneDrafts(keep: Iterable<string>): Promise<void>;
  };
  /** Which open copy of the site may write (instance.ts, D-35). */
  owner: {
    get(): Promise<string | undefined>;
    set(id: string): Promise<void>;
  };
}

const WINDOW_ID = 'web';

/** A store whose every call fails with `err` (storage blocked or unavailable). */
const brokenStore =
  (err: unknown): UseStore =>
  () =>
    Promise.reject(err);

const openStore = (db: string, name: string): UseStore => {
  try {
    return createStore(db, name);
  } catch (err) {
    // Safari throws here when storage is blocked; the renderer then reports each failure.
    return brokenStore(err);
  }
};

export function createStorage(dbName = 'md'): Storage {
  const files: UseStore = openStore(`${dbName}-files`, 'files');
  const state: UseStore = openStore(`${dbName}-state`, 'state');

  const toFileData = async (
    path: string,
    f: StoredFile,
  ): Promise<FileData> => ({
    path,
    name: f.name,
    text: f.text,
    hash: await hashText(f.text),
    mtimeMs: f.mtimeMs,
    eol: f.eol,
  });

  return {
    owner: {
      get: () => get<string>('owner', state),
      set: (id) => set('owner', id, state),
    },
    files: {
      async read(path) {
        const f = await get<StoredFile>(path, files);
        if (!f) throw new Error(`${path} is not on this device any more`);
        return toFileData(path, f);
      },
      async write(path, name, text, eol) {
        const f: StoredFile = { name, text, mtimeMs: Date.now(), eol };
        await set(path, f, files);
        return toFileData(path, f);
      },
      async exists(path) {
        return (await get(path, files)) !== undefined;
      },
      async uniquePath(folder, name) {
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let candidate = `${folder}/${name}`;
        for (let n = 2; (await get(candidate, files)) !== undefined; n++) {
          candidate = `${folder}/${stem} (${n})${ext}`;
        }
        return candidate;
      },
      async prune(keep) {
        const wanted = new Set(keep);
        for (const key of await keys(files)) {
          if (typeof key === 'string' && !wanted.has(key))
            await del(key, files);
        }
      },
    },
    session: {
      async load() {
        const [theme, window] = await Promise.all([
          get<SessionData['theme']>('theme', state),
          get<SessionWindowData>('window', state),
        ]);
        return { theme: theme ?? 'light', window: window ?? null };
      },
      async save(report) {
        const { theme, ...rest } = report;
        const entry: SessionWindowData = { ...rest, id: WINDOW_ID };
        await set('window', entry, state);
        await set('theme', theme, state);
      },
      setTheme: (pref) => set('theme', pref, state),
      writeDraft: (id, text) => set(`draft:${id}`, text, state),
      readDraft: async (id) =>
        (await get<string>(`draft:${id}`, state)) ?? null,
      deleteDraft: (id) => del(`draft:${id}`, state),
      async pruneDrafts(keep) {
        const wanted = new Set(Array.from(keep, (id) => `draft:${id}`));
        for (const key of await keys(state)) {
          if (
            typeof key === 'string' &&
            key.startsWith('draft:') &&
            !wanted.has(key)
          )
            await del(key, state);
        }
      },
    },
  };
}
