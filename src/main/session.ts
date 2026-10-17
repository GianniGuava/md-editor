import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { writeTextFileAtomic } from './files';

/**
 * Session persistence (PLAN.md step 6; D-22, D-23).
 *  - One session.json in userData, written atomically (temp file, fsync, rename) so a
 *    crash mid-write never corrupts it.
 *  - Unsaved text lives in userData/drafts/<draftId>.md; the user's own file is only
 *    written by an explicit Save (R-12).
 *  - `version` allows forward migration; unknown versions are ignored, never deleted.
 */

export const SESSION_VERSION = 1;

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

export interface SessionData {
  version: number;
  savedAt: string;
  window?: SessionWindow;
  theme: 'light' | 'dark' | 'hc' | 'system';
  paneMode: 'editor' | 'split' | 'preview';
  split: number;
  fontSize: number;
  highlight: boolean;
  scrollSync: boolean;
  tabs: SessionTab[];
  activeIndex: number;
  closed: { path: string | null; name: string; text: string }[];
}

export const sessionFile = (dir: string) => path.join(dir, 'session.json');
export const draftsDir = (dir: string) => path.join(dir, 'drafts');
const draftFile = (dir: string, id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`bad draft id: ${id}`);
  return path.join(draftsDir(dir), `${id}.md`);
};

/** Synchronous so window bounds can be applied before the first paint. */
export function loadSession(dir: string): SessionData | null {
  try {
    const raw = fs.readFileSync(sessionFile(dir), 'utf8');
    const data = JSON.parse(raw) as Partial<SessionData>;
    if (data.version !== SESSION_VERSION || !Array.isArray(data.tabs))
      return null;
    return data as SessionData;
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
