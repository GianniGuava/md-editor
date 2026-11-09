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
