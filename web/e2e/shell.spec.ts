import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The shell around the editor (PLAN.md §35, "Changes during the build"): layout on a
 * blank document, zoom, and the offline copy. Scan findings B-F1, B-F6 to B-F9.
 */

const box = async (page: Page, sel: string) =>
  (await page.locator(sel).boundingBox())!;

test('a blank document gets the whole screen and the status bar stays one line', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
  const viewport = page.viewportSize()!;
  const status = await box(page, '#status');
  const workspace = await box(page, '#workspace');
  expect(status.height).toBeLessThan(60);
  expect(status.y + status.height).toBeGreaterThan(viewport.height - 2);
  expect(workspace.y + workspace.height).toBeGreaterThan(status.y - 2);
});

test('pinch-zooming does not shrink the app', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
  const before = (await box(page, 'body')).height;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.waitForTimeout(300);
  const zoomed = await page.evaluate(() => document.body.offsetHeight);
  expect(Math.abs(zoomed - before)).toBeLessThan(4);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
});

test('every file the offline copy lists is in the build', async () => {
  const dist = path.join(__dirname, '..', 'dist');
  const sw = await fs.readFile(path.join(dist, 'sw.js'), 'utf8');
  // The minifier may write the list as an array or as one comma-separated string.
  const listed = [...sw.matchAll(/"(\/[^"]*)"/g)]
    .filter((m) => m[1].includes('/assets/'))
    .flatMap((m) => m[1].split(','))
    .filter((u) => u.startsWith('/') && /\.[a-z0-9]+$/i.test(u));
  expect(listed.length).toBeGreaterThan(10);
  const missing: string[] = [];
  for (const u of listed) {
    try {
      await fs.access(path.join(dist, u));
    } catch {
      missing.push(u);
    }
  }
  expect(missing).toEqual([]);
  expect(listed).not.toContain('/index.html');
  expect(listed).toContain('/manifest.webmanifest');
  expect(listed).toContain('/apple-touch-icon.png');
});

test('offline, the installed app still starts after another file on the site was opened', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker
  await page.waitForSelector('[role=tab]');
  await page.goto('/manifest.webmanifest');
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await context.setOffline(false);
});

test('held upright, the layout is unchanged even with the keyboard up', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
  await page.evaluate(() => (document.documentElement.dataset.keyboard = 'up'));
  await expect(page.locator('#preview-pane')).toBeVisible();
  await expect(page.locator('#status')).toBeVisible();
  const tabbar = await box(page, '#tabbar');
  const toolbar = await box(page, '#toolbar');
  expect(toolbar.y).toBeGreaterThan(tabbar.y + 10); // still stacked
});
