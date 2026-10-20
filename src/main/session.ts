import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { writeTextFileAtomic } from './files';

/**
 * Session persistence (PLAN.md step 6; D-22, D-23), version 2: one entry per window.
 *  - session.json in userData, written atomically (temp file, fsync, rename).
 *  - Unsaved text lives in userData/drafts/<draftId>.md; the user's own file is only
 *    written by an explicit Save (R-12).
 *  - Version 1 (single window) is migrated on load; unknown versions are ignored.
 */

export const SESSION_VERSION = 2;

export interface SessionTab {
  path: string | null;
  name: string;
  anchor: number;
  head: number;
  scrollTop: number;
  dirty: boolean;
  draft: string | null; // draft id when unsaved text exists
}

export interface SessionWindow {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface ClosedDocRecord {
  path: string | null;
  name: string;
  text: string;
}

export interface WindowUi {
  paneMode: 'editor' | 'split' | 'preview';
  split: number;
  fontSize: number;
  highlight: boolean;
  scrollSync: boolean;
  /** Optional so sessions written before 2026-10-19 stay valid (default on). */
  freezeHeaders?: boolean;
}

export interface SessionWindowData extends WindowUi {
  id: string;
  window?: SessionWindow;
  tabs: SessionTab[];
  activeIndex: number;
  closed: ClosedDocRecord[];
}

export interface SessionData {
  version: number;
  savedAt: string;
  theme: 'light' | 'dark' | 'hc' | 'system';
  windows: SessionWindowData[];
}

/** What a renderer reports for its own window (main adds id and bounds). */
export type WindowReport = Omit<SessionWindowData, 'id' | 'window'> & {
  theme: SessionData['theme'];
};

export const sessionFile = (dir: string) => path.join(dir, 'session.json');
export const draftsDir = (dir: string) => path.join(dir, 'drafts');
const draftFile = (dir: string, id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`bad draft id: ${id}`);
  return path.join(draftsDir(dir), `${id}.md`);
};

export function emptySession(): SessionData {
  return {
    version: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    theme: 'light',
    windows: [],
  };
}

interface SessionV1 {
  version: 1;
  window?: SessionWindow;
  theme: SessionData['theme'];
  paneMode: WindowUi['paneMode'];
  split: number;
  fontSize: number;
  highlight: boolean;
  scrollSync: boolean;
  tabs: SessionTab[];
  activeIndex: number;
  closed: ClosedDocRecord[];
}

function migrateV1(v1: SessionV1): SessionData {
  return {
    version: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    theme: v1.theme ?? 'light',
    windows: [
      {
        id: 'w1',
        window: v1.window,
        paneMode: v1.paneMode ?? 'split',
        split: v1.split ?? 50,
        fontSize: v1.fontSize ?? 18,
        highlight: v1.highlight ?? true,
        scrollSync: v1.scrollSync ?? true,
        tabs: v1.tabs ?? [],
        activeIndex: v1.activeIndex ?? 0,
        closed: v1.closed ?? [],
      },
    ],
  };
}

/** Keep the previous launch's file as session.previous.json before this launch writes. */
export function backupSession(dir: string): void {
  try {
    fs.copyFileSync(sessionFile(dir), path.join(dir, 'session.previous.json'));
  } catch {
    /* nothing to back up */
  }
}

/** Synchronous so window bounds can be applied before the first paint. */
export function loadSession(dir: string): SessionData | null {
  try {
    const raw = fs.readFileSync(sessionFile(dir), 'utf8');
    const data = JSON.parse(raw) as { version?: number };
    if (data.version === 1 && Array.isArray((data as SessionV1).tabs)) {
      return migrateV1(data as SessionV1);
    }
    if (
      data.version === SESSION_VERSION &&
      Array.isArray((data as SessionData).windows)
    ) {
      return data as SessionData;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSession(
  dir: string,
  data: SessionData,
): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
  await writeTextFileAtomic(sessionFile(dir), JSON.stringify(data, null, 2));
}

export async function writeDraft(
  dir: string,
  id: string,
  text: string,
): Promise<void> {
  await fsp.mkdir(draftsDir(dir), { recursive: true });
  await writeTextFileAtomic(draftFile(dir, id), text);
}

export async function readDraft(
  dir: string,
  id: string,
): Promise<string | null> {
  try {
    return await fsp.readFile(draftFile(dir, id), 'utf8');
  } catch {
    return null;
  }
}

export async function deleteDraft(dir: string, id: string): Promise<void> {
  await fsp.rm(draftFile(dir, id), { force: true });
}

/** Drop drafts no session tab references (crash leftovers). */
export async function pruneDrafts(
  dir: string,
  keep: Set<string>,
): Promise<void> {
  let names: string[] = [];
  try {
    names = await fsp.readdir(draftsDir(dir));
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((n) => n.endsWith('.md') && !keep.has(n.slice(0, -3)))
      .map((n) => fsp.rm(path.join(draftsDir(dir), n), { force: true })),
  );
}

export const draftIdsIn = (data: SessionData | null): Set<string> =>
  new Set(
    (data?.windows ?? []).flatMap((w) =>
      w.tabs.flatMap((t) => (t.draft ? [t.draft] : [])),
    ),
  );
