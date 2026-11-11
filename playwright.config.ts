import { defineConfig, devices } from '@playwright/test';
import { E2E } from './e2e/constants';

/**
 * End-to-end tests: desktop Chrome, Android (Pixel 7) and iPhone (Safari/WebKit).
 * Needs PostgreSQL (docker compose up -d db, or npm run db:local).
 * PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's browsers (WebKit is then skipped).
 */
const channel = process.env.PW_CHANNEL || undefined;
const withWebkit = !channel && !process.env.PW_SKIP_WEBKIT;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one shared server + database
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: E2E.baseURL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build -w @shani/web && npx tsx e2e/server.ts',
    url: `${E2E.baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'], channel } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel }, dependencies: ['setup'] },
    { name: 'android', use: { ...devices['Pixel 7'], channel }, testIgnore: /admin\.spec/, dependencies: ['setup'] },
    ...(withWebkit ? [{ name: 'iphone', use: { ...devices['iPhone 14'] }, testIgnore: /admin\.spec/, dependencies: ['setup'] }] : []),
  ],
});
