import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * End-to-end checks against the production bundle (PLAN.md step 9.1):
 * keyboard/mouse flows through the renderer, session restore across a relaunch,
 * and an axe-core scan of the main screen. Native menu accelerators are not
 * reachable from synthetic key events, so flows use toolbar buttons and the
 * renderer's own key handlers (Ctrl+1..9, splitter arrows).
 *
 * Run `npm run package` first: it writes the production main/preload/renderer
 * bundles to .vite/. The suite launches them with the development Electron
 * binary because the packaged md.exe carries Forge fuses that disable the Node
 * inspector flags Playwright's driver relies on.
 */

const projectDir = path.resolve('.');

let dir: string;
let file: string;
let userData: string;

const launch = async (args: string[]) => {
  const app = await electron.launch({
    args: [projectDir, ...args],
    env: { ...process.env, MD_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('[role=tab]');
  return { app, page };
};

/** Close without the Save/Don't save dialog (the session is already flushed by debounce). */
const closeQuietly = async (app: ElectronApplication, page: Page) => {
  await page.waitForTimeout(700); // let the 500 ms session debounce flush
  const proc = app.process();
  const exited = new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
    setTimeout(resolve, 5000);
  });
  // closeNow() destroys the window before its IPC reply arrives, so fire and forget.
  await page
    .evaluate(() => {
      void window.md.closeNow();
    })
    .catch(() => undefined);
  await app.close().catch(() => undefined);
  await exited;
  await new Promise((r) => setTimeout(r, 300));
};

test.beforeAll(async () => {
  await fs.access(path.join(projectDir, '.vite', 'renderer')).catch(() => {
    throw new Error(
      'Production bundle missing: run `npm run package` before `npm run test:e2e`.',
    );
  });
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-e2e-'));
  userData = path.join(dir, 'userdata');
  file = path.join(dir, 'note.md');
  await fs.writeFile(file, '# Note\n\nHello **world**.\n');
});

test.afterAll(async () => {
  await fs.rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
});

test('opens a file, edits in a new tab, switches panes, restores the session', async () => {
  const { app, page } = await launch([file]);
  try {
    // Command-line file is open and rendered.
    await expect(page.locator('[role=tab]')).toHaveCount(1);
    await expect(page.locator('[role=tab][aria-selected=true]')).toContainText(
      'note.md',
    );
    await expect(page).toHaveTitle(/note\.md/);
    await expect(page.locator('#preview-pane h1')).toHaveText('Note');

    // New tab from the toolbar, type, dirty marker appears (not colour-only).
    await page.getByRole('button', { name: /^New/ }).click();
    await expect(page.locator('[role=tab]')).toHaveCount(2);
    await page.locator('.cm-content').click();
    await page.keyboard.type('Draft text');
    await expect(
      page.locator('[role=tab][aria-selected=true] .visually-hidden'),
    ).toHaveText(/modified/);
    await expect(page).toHaveTitle(/Untitled-1 •/);
    await expect(page.locator('#preview-pane')).toContainText('Draft text');

    // Ctrl+1 jumps to the first tab (renderer handler).
    await page.keyboard.press('Control+1');
    await expect(page.locator('[role=tab][aria-selected=true]')).toContainText(
      'note.md',
    );

    // Pane modes from the toolbar.
    await page.getByRole('button', { name: /^Preview/ }).click();
    await expect(page.locator('#panes')).toHaveAttribute(
      'data-mode',
      'preview',
    );
    // The pane must actually take the width (regression: it once landed in a 0 px column).
    const box = await page.locator('#preview-pane').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    await expect(page.locator('#preview-pane h1')).toBeVisible();
    await expect(page.locator('#editor-pane')).toBeHidden();
    await page.getByRole('button', { name: /^Split/ }).click();
    await expect(page.locator('#panes')).toHaveAttribute('data-mode', 'split');

    // Splitter is keyboard-operable.
    await page.locator('#splitter').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#splitter')).toHaveAttribute(
      'aria-valuenow',
      '52',
    );

    // Tab strip keyboard navigation: ArrowRight moves focus, Enter activates.
    await page.locator('[role=tab][aria-selected=true]').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('[role=tab][aria-selected=true]')).toContainText(
      'Untitled-1',
    );
  } finally {
    await closeQuietly(app, page);
  }

  // Relaunch with no arguments: both tabs come back, the draft is recovered.
  const second = await launch([]);
  try {
    await expect(second.page.locator('[role=tab]')).toHaveCount(2);
    await expect(
      second.page.locator('[role=tab][aria-selected=true]'),
    ).toContainText('Untitled-1');
    await expect(second.page.locator('#banners')).toContainText(
      /Recovered unsaved changes/,
    );
    await expect(second.page.locator('.cm-content')).toContainText(
      'Draft text',
    );
    await expect(second.page.locator('#splitter')).toHaveAttribute(
      'aria-valuenow',
      '52',
    );
  } finally {
    await closeQuietly(second.app, second.page);
  }
});

test('main screen has no serious or critical axe violations', async () => {
  const { app, page } = await launch([file]);
  try {
    // @axe-core/playwright's AxeBuilder opens a helper page, which Electron's CDP
    // does not support, and a <script> tag is (correctly) blocked by the app's CSP.
    // Evaluating the source through the debugging protocol sidesteps both.
    const axeSource = await fs.readFile(
      path.join(projectDir, 'node_modules', 'axe-core', 'axe.min.js'),
      'utf8',
    );
    await page.evaluate(axeSource);
    const results = (await page.evaluate(() =>
      (window as unknown as { axe: { run(): Promise<unknown> } }).axe.run(),
    )) as {
      violations: {
        id: string;
        impact?: string;
        help: string;
        nodes: { target: string[] }[];
      }[];
    };
    for (const v of results.violations) {
      console.log(
        `[axe] ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes)`,
      );
      for (const n of v.nodes.slice(0, 3))
        console.log('   ', n.target.join(' '));
    }
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      blocking,
      blocking.map((v) => `${v.id}: ${v.help}`).join('\n'),
    ).toEqual([]);
  } finally {
    await closeQuietly(app, page);
  }
});
