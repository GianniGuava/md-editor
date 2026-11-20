import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Saving, sharing and exporting in the browser build (PLAN.md D-30, D-31): the findings
 * of the 2026-11-20 scan of dc78425. navigator.share is replaced by a stand-in, since
 * Chromium has no iOS share sheet.
 */

type Shared = { files?: File[] };
const stubShare = (page: Page, after?: 'edit') =>
  page.addInitScript((mode) => {
    const w = window as unknown as { __shared: Shared[] };
    w.__shared = [];
    Object.assign(navigator, {
      canShare: () => true,
      share: (data: Shared) => {
        w.__shared.push(data);
        if (mode === 'edit')
          setTimeout(() => {
            (document.querySelector('.cm-content') as HTMLElement).focus();
            document.execCommand('insertText', false, 'X');
          }, 0);
        return Promise.resolve();
      },
    });
  }, after);

const sharedText = (page: Page, i = 0) =>
  page.evaluate(
    (n) =>
      (window as unknown as { __shared: Shared[] }).__shared[
        n
      ]?.files?.[0]?.text(),
    i,
  );

const importFile = async (page: Page, name: string, text: string) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-web-'));
  const p = path.join(dir, name);
  await fs.writeFile(p, text);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(p);
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
};

const exportHtml = async (page: Page) => {
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Export…' })
    .click();
  await page.locator('#export-dialog input[value=html]').check();
  await page.locator('#export-go').click();
  return page.locator('dialog.web-dialog[open]').last();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
});

test('an exported page keeps the web pictures the preview showed', async ({
  page,
}) => {
  await stubShare(page);
  await page.reload();
  await page.locator('.cm-content').click();
  await page.keyboard.type('![pic](https://example.com/a.png)');
  const save = await exportHtml(page);
  await save.getByRole('button', { name: 'Share…' }).click();
  const html = (await sharedText(page))!;
  expect(html).toContain('src="https://example.com/a.png"');
  expect(html).toMatch(/img-src data: https:/);
  // Nothing else is loosened: still no scripts, no other remote content.
  expect(html).toMatch(/default-src 'none'/);
});

test('a share reports "shared", not "saved"', async ({ page }) => {
  await stubShare(page);
  await page.reload();
  await importFile(page, 'note.md', '# Note');
  await page.locator('.cm-content').click();
  await page.keyboard.type('more ');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.locator('dialog.web-dialog[open]').last();
  await expect(dialog).toContainText('cannot see');
  await dialog.getByRole('button', { name: 'Share…' }).click();
  await expect(page.locator('#status-note')).toContainText('Shared "note.md"');
});

test('an edit that lands while the share is being recorded keeps the tab marked modified', async ({
  page,
}) => {
  await stubShare(page, 'edit');
  await page.reload();
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello');
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Save as…' })
    .click();
  const dialog = page.locator('dialog.web-dialog[open]').last();
  await dialog.getByLabel('File name').fill('late-edit');
  await dialog.getByRole('button', { name: 'Share…' }).click();
  await expect(page.locator('.cm-content')).toContainText('X');
  expect(await sharedText(page)).toBe('hello');
  await expect(page.getByRole('tab').first()).toContainText('(modified)');
});

test('Save hands the file over under exactly the name it shows', async ({
  page,
}) => {
  // Checked through Share: for a Download, Chromium itself adds ".md" to a name with
  // no extension (from the text/markdown type), whatever name the app gives it.
  await stubShare(page);
  await page.reload();
  await importFile(page, 'README', '# Readme');
  await page.locator('.cm-content').click();
  await page.keyboard.type('x');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.locator('dialog.web-dialog[open]').last();
  await expect(dialog.getByLabel('File name')).toHaveValue('README');
  await dialog.getByRole('button', { name: 'Share…' }).click();
  const name = await page.evaluate(
    () =>
      (window as unknown as { __shared: Shared[] }).__shared[0]?.files?.[0]
        ?.name,
  );
  expect(name).toBe('README');
});

test('an exported download is described without guessing its folder', async ({
  page,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Title');
  const save = await exportHtml(page);
  const download = page.waitForEvent('download');
  await save.getByRole('button', { name: 'Download' }).click();
  await download;
  await expect(page.locator('#status-note')).toContainText(
    '"Untitled-1.html" as a download',
  );
  await expect(page.locator('#status-note')).not.toContainText('Downloads/');
});

test('an HTML export always ends in .html', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Title');
  const save = await exportHtml(page);
  await save.getByLabel('File name').fill('notes.md');
  const download = page.waitForEvent('download');
  await save.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('notes.md.html');
});

test('cancelling the Save dialog over Export puts focus back on Export', async ({
  page,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Title');
  const save = await exportHtml(page);
  await save.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#export-go')).toBeFocused();
});

test('two Save presses in a row open one Save dialog', async ({ page }) => {
  await importFile(page, 'note.md', '# Note');
  await page.locator('.cm-content').click();
  await page.keyboard.type('x');
  await page
    .getByRole('button', { name: 'Save', exact: true })
    .evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
  await expect(page.locator('dialog.web-dialog[open]')).toHaveCount(1);
  await page.waitForTimeout(300);
  await expect(page.locator('dialog.web-dialog[open]')).toHaveCount(1);
});
