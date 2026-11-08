/**
 * Line endings and hashing for the browser "disk" (mirrors src/main/files.ts):
 * the editor always works in LF; a file's own convention is kept and written back.
 */
export type Eol = '\n' | '\r\n';

export function splitEol(raw: string): { text: string; eol: Eol } {
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lone = (raw.match(/\n/g) ?? []).length - crlf;
  return {
    text: raw.replace(/\r\n?/g, '\n'),
    eol: crlf > lone ? '\r\n' : '\n',
  };
}

export function joinEol(text: string, eol: Eol = '\n'): string {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** SHA-256 hex like the desktop app; a short FNV-1a hash where WebCrypto is missing (plain-http dev). */
export async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  }
  let h = 0x811c9dc5;
  for (const b of data) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const basename = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1);
