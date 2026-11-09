import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Keeping the user's documents (PLAN.md §35, "Changes during the build"): the cases the
 * 2026-11-08 scan found where the browser build lost or hid work, run at an iPhone
 * viewport in Chromium.
 */

const importFiles = async (page: Page, files: Record<string, string>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-web-'));
  const paths: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    const p = path.join(dir, name);
    await fs.writeFile(p, text);
    paths.push(p);
  }
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(paths);
};

const tabNames = (page: Page) =>
  page
    .getByRole('tab')
    .evaluateAll((tabs) =>
      tabs.map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim()),
    );

const settle = (page: Page) => page.waitForTimeout(900); // past the 500 ms debounce

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
});

test('a page that loses focus while tabs are restoring keeps every document', async ({
  page,
}) => {
  await importFiles(page, {
    'one.md': '# One',
    'two.md': '# Two',
    'three.md': '# Three',
  });
  await expect(page.getByRole('tab')).toHaveCount(3);
  await settle(page);

  // Next launch: the page is backgrounded again and again while it restores, and the
  // first file read is slow, as on a phone waking up.
  await page.addInitScript(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      window.dispatchEvent(new Event('blur'));
      if (Date.now() - started > 2500) window.clearInterval(id);
    }, 5);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let first = true;
    crypto.subtle.digest = async (...args: Parameters<typeof digest>) => {
      if (first) {
        first = false;
        await new Promise((r) => setTimeout(r, 900));
      }
      return digest(...args);
    };
  });
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await page.waitForTimeout(2800);

  // And the launch after that still has all three, with no "no longer exists" notice.
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(3);
  expect((await tabNames(page)).join(' ')).toMatch(
    /one\.md.*two\.md.*three\.md/,
  );
  await expect(page.locator('#banners')).not.toContainText('no longer exists');
});

test('reopening a closed tab brings the document back as it was', async ({
  page,
}) => {
  await importFiles(page, { 'kept.md': '# Kept' });
  await expect(page.getByRole('tab', { name: /kept\.md/ })).toBeVisible();
  await settle(page);
  await page
    .getByRole('tab', { name: /kept\.md/ })
    .locator('.tab-close')
    .click();
  await settle(page);
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Reopen closed tab' })
    .click();
  const reopened = page.getByRole('tab', { name: /kept\.md/ });
  await expect(reopened).toBeVisible();
  await expect(reopened).not.toContainText('(modified)');
  await expect(page.locator('#status-main')).toContainText('Imported/kept.md');
});

test('the newest tab takes over and the older one stops saving', async ({
  page,
  context,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Typed in the first tab');
  // No pause: the first tab must hand over text it has not written yet.
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#preview-pane h1')).toHaveText(
    'Typed in the first tab',
  );
  const notice = page.getByRole('dialog', { name: /open in another tab/i });
  await expect(notice).toBeVisible();

  // Work in the second tab survives the first tab's later attempts to save.
  await second.locator('.cm-content').click();
  await second.keyboard.press('End');
  await second.keyboard.type(' and the second');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await settle(second);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await second.reload();
  await expect(second.locator('#preview-pane h1')).toHaveText(
    'Typed in the first tab and the second',
  );

  // "Use MD here" moves it back, with the second tab's text.
  await expect(
    second.getByRole('dialog', { name: /open in another tab/i }),
  ).toBeHidden();
  await notice.getByRole('button', { name: 'Use MD here' }).click();
  await expect(page.locator('#preview-pane h1')).toHaveText(
    'Typed in the first tab and the second',
  );
  await expect(
    second.getByRole('dialog', { name: /open in another tab/i }),
  ).toBeVisible();
});

/** Make IndexedDB writes fail while `window.__failPut(value, key)` returns true. */
const failingPuts = (page: Page) =>
  page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      const w = window as unknown as {
        __failPut?: (v: unknown, k?: IDBValidKey) => boolean;
      };
      if (w.__failPut?.(value, key))
        throw new DOMException(
          'The quota has been exceeded.',
          'QuotaExceededError',
        );
      return put.call(this, value, key);
    };
  });

test('an import that fails part-way opens the files that worked and says which failed', async ({
  page,
}) => {
  await failingPuts(page);
  await page.reload();
  await page.waitForSelector('[role=tab]');
  await page.evaluate(() => {
    (window as unknown as { __failPut: (v: unknown) => boolean }).__failPut = (
      v,
    ) => (v as { name?: string })?.name === 'c.md';
  });
  await importFiles(page, { 'a.md': '# A', 'b.md': '# B', 'c.md': '# C' });
  await expect(page.getByRole('tab', { name: /a\.md/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /b\.md/ })).toBeVisible();
  await expect(page.locator('#banners')).toContainText('c.md');
  await expect(page.locator('#banners')).toContainText('QuotaExceededError');
});

test('when drafts cannot be backed up the user is told, and the notice clears once they can', async ({
  page,
}) => {
  await failingPuts(page);
  await page.reload();
  await page.waitForSelector('[role=tab]');
  await page.evaluate(() => {
    (
      window as unknown as { __failPut: (v: unknown, k?: unknown) => boolean }
    ).__failPut = (_v, k) => typeof k === 'string' && k.startsWith('draft:');
  });
  await page.locator('.cm-content').click();
  await page.keyboard.type('Unsaved words');
  await expect(page.locator('#banners')).toContainText(
    'could not be backed up',
  );
  await page.evaluate(() => {
    (window as unknown as { __failPut?: unknown }).__failPut = undefined;
  });
  await page.keyboard.type(' and more');
  await expect(page.locator('#banners')).not.toContainText(
    'could not be backed up',
  );
});

test('a phone whose storage is blocked still gets an editor and an explanation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    };
  });
  await page.reload();
  await expect(page.locator('#banners')).toContainText('could not be loaded');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Still works');
  await expect(page.locator('#preview-pane h1')).toHaveText('Still works');
});

test('a save whose record cannot be written says so instead of failing silently', async ({
  page,
}) => {
  await failingPuts(page);
  await page.reload();
  await page.waitForSelector('[role=tab]');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Text to keep');
  await page.evaluate(() => {
    (
      window as unknown as { __failPut: (v: unknown, k?: unknown) => boolean }
    ).__failPut = (_v, k) => typeof k === 'string' && k.startsWith('Shared/');
  });
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Save as…' })
    .click();
  const save = page.locator('dialog.web-dialog').last();
  await save.getByLabel('File name').fill('kept');
  const download = page.waitForEvent('download');
  await save.getByRole('button', { name: 'Download' }).click();
  await download;
  await expect(page.locator('#banners')).toContainText('could not record');
  await expect(page.getByRole('tab').first()).toContainText('(modified)');
});
