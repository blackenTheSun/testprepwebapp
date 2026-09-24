import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests open the *delivered* single file (dist/index.html) over file://, with the browser
 * offline, exactly as Amy would. Run `npm run build` first.
 * Locally: `npx playwright test --project=chromium --project=msedge`. CI runs chromium, firefox and webkit.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    offline: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // Playwright's WebKit cannot navigate to file:// while the context is offline, so WebKit relies on
    // the http(s) route block in tests/e2e/helpers.ts (plus the build CSP) instead of offline mode.
    { name: 'webkit', use: { ...devices['Desktop Safari'], offline: false } },
    // Installed Microsoft Edge (Windows/macOS dev machines); not used in CI.
    { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
});
