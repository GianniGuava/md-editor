import { test, expect, devices, type Page } from '@playwright/test';

/**
 * A phone held sideways (PLAN.md D-36, Gianni 2026-11-20 "2a"): tabs and toolbar in one
 * slim row, no status bar, and the preview steps aside while the on-screen keyboard is
 * up. Chromium has no on-screen keyboard, so the keyboard state is set the way
 * viewport.ts sets it.
 */

test.use({ ...devices['iPhone 13 landscape'], browserName: 'chromium' });

const box = async (page: Page, sel: string) =>
  (await page.locator(sel).boundingBox())!;
const setKeyboard = (page: Page, up: boolean) =>
  page.evaluate((u) => {
    if (u) document.documentElement.dataset.keyboard = 'up';
    else delete document.documentElement.dataset.keyboard;
  }, up);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
});

test('tabs and toolbar share one slim row and the status bar steps aside', async ({
  page,
}) => {
  const tabbar = await box(page, '#tabbar');
  const toolbar = await box(page, '#toolbar');
  expect(Math.abs(tabbar.y - toolbar.y)).toBeLessThan(4); // side by side
  expect((await box(page, '#chrome')).height).toBeLessThan(56);
  await expect(page.locator('#status')).toBeHidden();
  // Every tool is still reachable: the row scrolls sideways.
  await expect(page.locator('#menu-button')).toBeAttached();
});

test('while the keyboard is up the editor takes the full width, and the preview returns after', async ({
  page,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Sideways');
  const width = page.viewportSize()!.width;
  await setKeyboard(page, true);
  await expect(page.locator('#preview-pane')).toBeHidden();
  expect((await box(page, '#editor-pane')).width).toBeGreaterThan(width - 4);
  await setKeyboard(page, false);
  await expect(page.locator('#preview-pane')).toBeVisible();
  await expect(page.locator('#preview-pane h1')).toHaveText('Sideways');
  // The user's own pane choice is untouched.
  await expect(page.locator('#panes')).toHaveAttribute('data-mode', 'split');
});
