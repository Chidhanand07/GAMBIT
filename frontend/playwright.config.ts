import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against a production build (F-115). Build first (`npx next build`); the web
// server below then serves it. Projects: the three engines on desktop, and an iPhone (WebKit,
// 390px, touch) for the phone layout. The parity track adds its own config; the lead reconciles them.

const PORT = Number(process.env.E2E_PORT ?? 3203);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 7_000 },
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    workers: CI ? 2 : 3,
    reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL: BASE_URL, trace: 'on-first-retry' },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'iphone', use: { ...devices['iPhone 13'] } },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : { command: `npx next start -p ${PORT}`, url: BASE_URL, reuseExistingServer: !CI, timeout: 120_000 },
});
