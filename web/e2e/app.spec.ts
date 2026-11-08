import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Browser build end-to-end (PLAN.md §35) at an iPhone viewport: stacked panes, typing
 * reaches the preview, the splitter answers Up/Down, import, save as download, the menu,
 * session restore across a reload, and an axe-core scan.
 */

const typeInEditor = async (page: Page, text: string) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type(text);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role=tab]');
});

test('stacks the editor above the preview on a phone', async ({ page }) => {
  const panes = page.locator('#panes');
  await expect(panes).toHaveAttribute('data-orientation', 'rows');
  await expect(page.locator('#splitter')).toHaveAttribute(
    'aria-orientation',
    'horizontal',
  );
  const editor = await page.locator('#editor-pane').boundingBox();
  const preview = await page.locator('#preview-pane').boundingBox();
  expect(editor && preview).toBeTruthy();
  expect(editor!.y + editor!.height).toBeLessThanOrEqual(preview!.y + 1);
  expect(Math.abs(editor!.width - preview!.width)).toBeLessThan(2);
  // The desktop-only "New window" button is hidden; the Menu button is present.
  await expect(
    page.getByRole('button', { name: 'Window', exact: true }),
  ).toBeHidden();
  await expect(page.locator('#menu-button')).toBeVisible();
});

test('typing renders in the preview and the splitter answers Up/Down', async ({
  page,
}) => {
  await typeInEditor(page, '# Hello phone');
  await expect(page.locator('#preview-pane h1')).toHaveText('Hello phone');
  const splitter = page.locator('#splitter');
  await splitter.focus();
  await page.keyboard.press('ArrowDown');
  await expect(splitter).toHaveAttribute('aria-valuenow', '52');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(splitter).toHaveAttribute('aria-valuenow', '42');
});

test('imports a file into a tab and saves it as a download', async ({
  page,
}) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-web-'));
  const file = path.join(dir, 'notes.md');
  await fs.writeFile(file, '# Imported\r\n\r\nFrom the Files app.\r\n');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole('tab', { name: /notes\.md/ })).toBeVisible();
  await expect(page.locator('#preview-pane h1')).toHaveText('Imported');
  await expect(page.locator('#status-main')).toContainText('Imported/notes.md');

  await typeInEditor(page, 'Edited. ');
  await expect(page.getByRole('tab', { name: /notes\.md/ })).toContainText(
    '(modified)',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.locator('dialog.web-dialog');
  await expect(dialog.getByRole('heading', { name: 'Save' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('notes.md');
  await expect(page.getByRole('tab', { name: /notes\.md/ })).not.toContainText(
    '(modified)',
  );
});

test('save as names the shared copy and the menu switches theme and layout', async ({
  page,
}) => {
  await typeInEditor(page, 'Some text');
  await page.locator('#menu-button').click();
  const menu = page.locator('#menu-dialog');
  await expect(menu.getByRole('heading', { name: 'Menu' })).toBeVisible();
  await menu.getByRole('button', { name: 'Save as…' }).click();
  const save = page.locator('dialog.web-dialog').last();
  await expect(save.getByRole('heading', { name: 'Save as' })).toBeVisible();
  await save.getByLabel('File name').fill('shared-copy');
  const download = page.waitForEvent('download');
  await save.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('shared-copy.md');
  await expect(page.locator('#status-main')).toContainText(
    'Shared/shared-copy.md',
  );

  await page.locator('#menu-button').click();
  await menu
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name: 'Dark' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#menu-button').click();
  await menu
    .getByRole('group', { name: 'Layout' })
    .getByRole('button', { name: 'Side by side' })
    .click();
  await expect(page.locator('#panes')).toHaveAttribute(
    'data-orientation',
    'columns',
  );
});

test('restores open tabs, text and settings after a reload', async ({
  page,
}) => {
  await typeInEditor(page, '# Keep me');
  await page.locator('#menu-button').click();
  await page
    .locator('#menu-dialog')
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name: 'Dark' })
    .click();
  await page.waitForTimeout(800); // past the 500 ms session debounce
  await page.reload();
  await page.waitForSelector('[role=tab]');
  await expect(page.locator('#preview-pane h1')).toHaveText('Keep me');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#banners')).toContainText(
    'Recovered unsaved changes',
  );
});

test('has no serious accessibility violations', async ({ page }) => {
  await typeInEditor(page, '# Heading\n\nParagraph with **bold**.');
  const results = await new AxeBuilder({ page })
    .disableRules(['page-has-heading-one']) // headings come from the document, not the UI
    .analyze();
  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
