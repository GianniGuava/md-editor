import { defineConfig, devices } from '@playwright/test';

/**
 * Browser build end-to-end (PLAN.md §35): the production bundle served by `vite preview`,
 * driven at an iPhone viewport. Chromium stands in for Safari here; the Safari-only
 * behaviours (share sheet, keyboard viewport) are checked on the device by hand.
 */
export default defineConfig({
  testDir: 'web/e2e',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'npm run build:web && npm run preview:web',
    url: 'http://localhost:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4180',
    trace: 'retain-on-failure',
  },
});
