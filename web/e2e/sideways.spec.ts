import { test, expect, devices, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  const status = await box(page, '#status');
  expect(status.width * status.height).toBeLessThanOrEqual(1);
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

/** The keyboard as viewport.ts reports it: up, with `visible` pixels left above it. */
const keyboardOver = (page: Page, visible: number) =>
  page.evaluate((v) => {
    document.documentElement.dataset.keyboard = 'up';
    document.documentElement.style.setProperty('--vv-height', `${v}px`);
  }, visible);

test('the Menu and every pane button fit on screen without swiping', async ({
  page,
}) => {
  const width = page.viewportSize()!.width;
  const menu = await box(page, '#menu-button');
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(width);
  const preview = await box(page, '#toolbar button[title^="Preview only"]');
  expect(preview.x + preview.width).toBeLessThanOrEqual(width);
});

test('with the keyboard up, a notice and Find still leave three lines of editor', async ({
  page,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Sideways');
  await page.evaluate(() => {
    const b = document.createElement('div');
    b.className = 'banner banner-danger';
    b.innerHTML =
      '<p class="banner-message">Unsaved changes could not be backed up (QuotaExceededError). Save your work to keep it; this notice goes away once backing up works again.</p><div class="banner-actions"><button type="button" class="tool">Dismiss</button></div>';
    document.getElementById('banners')!.appendChild(b);
  });
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Find…' })
    .click();
  await expect(page.locator('.cm-search')).toBeVisible();
  await keyboardOver(page, 190);
  const lineHeight = await page
    .locator('.cm-line')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  const scroller = await box(page, '.cm-scroller');
  expect(scroller.height).toBeGreaterThanOrEqual(3 * lineHeight - 1);
  // The notice is still there, just shorter, and returns in full when the keyboard closes.
  await expect(page.locator('#banners .banner')).toBeVisible();
});

test('with the keyboard up, the Save as dialog sits in the visible part of the screen', async ({
  page,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('words');
  await keyboardOver(page, 190);
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Save as…' })
    .click();
  const dialog = page.locator('dialog.web-dialog[open]').last();
  const b = await dialog.boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(191);
  await expect(dialog.getByLabel('File name')).toBeVisible();
});

test('fields are at least 16 px so iOS does not zoom on focus', async ({
  page,
}) => {
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Find…' })
    .click();
  const findSize = await page
    .locator('.cm-search input')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(findSize).toBeGreaterThanOrEqual(16);
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('button', { name: 'Save as…' })
    .click();
  const nameSize = await page
    .locator('dialog[open]')
    .last()
    .getByLabel('File name')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(nameSize).toBeGreaterThanOrEqual(16);
});

test('the hidden status line still announces "Saved" to screen readers', async ({
  page,
}) => {
  const status = page.locator('#status');
  const b = await box(page, '#status');
  expect(b.width * b.height).toBeLessThanOrEqual(1);
  const display = await status.evaluate((el) => getComputedStyle(el).display);
  expect(display).not.toBe('none');
  await expect(status).toHaveAttribute('aria-live', 'polite');
});

test('a tap just above the divider still places the caret in the editor', async ({
  page,
}) => {
  const editor = await box(page, '#editor-pane');
  // Side by side: 6 px inside the editor's right edge.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await expect(page.locator('.cm-editor')).not.toHaveClass(/cm-focused/);
  await page.touchscreen.tap(editor.x + editor.width - 6, editor.y + 40);
  await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
});

test('the top strip of the screen follows the theme', async ({ page }) => {
  const meta = page.locator('meta[name="theme-color"]');
  await expect(meta).toHaveAttribute('content', '#e6e6e6');
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name: 'Dark' })
    .click();
  await expect(meta).toHaveAttribute('content', '#2a2a2a');
});

test.describe('a small phone held sideways (568 x 320)', () => {
  test.use({ viewport: { width: 568, height: 320 } });

  test('the All tabs list stays on screen', async ({ page }) => {
    for (let i = 0; i < 6; i++)
      await page.getByRole('button', { name: 'New', exact: true }).click();
    const allTabs = page.getByRole('button', {
      name: /All tabs|all open tabs/i,
    });
    await allTabs.click();
    const list = await box(page, '#all-tabs-list');
    expect(list.x).toBeGreaterThanOrEqual(0);
    expect(list.x + list.width).toBeLessThanOrEqual(568);
  });
});

test('has no serious accessibility violations held sideways', async ({
  page,
}) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('# Heading\n\nParagraph with **bold**.');
  const results = await new AxeBuilder({ page })
    .disableRules(['page-has-heading-one'])
    .analyze();
  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
