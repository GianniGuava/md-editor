import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickFiles } from './filePicker';

/** The chooser must not give up on a file that is slow to arrive (scan finding A-F10). */

afterEach(() => vi.useRealTimers());

const input = () =>
  document.querySelector<HTMLInputElement>('[data-role=import-input]')!;
const giveFiles = (el: HTMLInputElement, files: File[]) => {
  Object.defineProperty(el, 'files', { value: files, configurable: true });
  el.dispatchEvent(new Event('change'));
};

describe('pickFiles', () => {
  it('still takes a file that arrives well after the page regains focus', async () => {
    vi.useFakeTimers();
    const picked = pickFiles();
    const el = input();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(5000); // an iCloud download
    giveFiles(el, [new File(['# Hi'], 'slow.md')]);
    expect((await picked).map((f) => f.name)).toEqual(['slow.md']);
  });

  it('resolves empty when the chooser reports a cancel', async () => {
    const picked = pickFiles();
    input().dispatchEvent(new Event('cancel'));
    expect(await picked).toEqual([]);
  });
});
