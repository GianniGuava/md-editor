/**
 * File bytes to editor text, shared by the desktop (files.ts) and the browser build
 * (web/api.ts) so both read a file the same way.
 *  - UTF-8 is tried first, strictly. A byte-order mark is kept as U+FEFF so Save writes
 *    the file back unchanged (scan finding A-F5).
 *  - Bytes that are not valid UTF-8 are read as Windows-1252, the usual encoding of older
 *    Windows text files, instead of being replaced with U+FFFD; the caller is told so it
 *    can say so, and Save writes UTF-8 (finding A-flagA; user decision 2026-11-09 "Here").
 *    STANDARD: WHATWG Encoding Standard (TextDecoder labels; "latin1" and "iso-8859-1"
 *    also mean windows-1252).
 */
export type SourceEncoding = 'windows-1252';

export function decodeText(bytes: Uint8Array): {
  text: string;
  encoding?: SourceEncoding;
} {
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        bytes,
      ),
    };
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(bytes),
      encoding: 'windows-1252',
    };
  }
}
