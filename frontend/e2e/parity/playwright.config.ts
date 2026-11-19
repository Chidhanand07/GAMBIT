/**
 * Visual parity harness (ADR F-096): `npm run test:parity` in frontend/.
 * One Chromium project per parity width; the app runs on `next dev` (PARITY_PORT, default 3201).
 * With the TEST project configured (scripts/test-db), the dev server gets its keys and the local
 * game server + Redis (scripts/test-db/stack.js) start too, so signed-in pages and a live game run.
 */
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { FRONTEND_DIR, PARITY_WIDTHS, REPO_ROOT, settings, VIEWPORT_HEIGHTS } from './config/settings';
import { SERVER_PORT, testEnvStatus, webServerEnv } from './lib/testEnv';

const SERVER_START_TIMEOUT_MS = 180000;
/** Per case: mockup + app + (for the game) a two-browser live game. */
const TEST_TIMEOUT_MS = 180000;
const withTestProject = testEnvStatus().ok;

const nextDev = {
    command: `npx next dev -p ${settings.port}`,
    cwd: FRONTEND_DIR,
    url: settings.baseURL,
    reuseExistingServer: settings.reuseServer,
    timeout: SERVER_START_TIMEOUT_MS,
    env: { NEXT_TELEMETRY_DISABLED: '1', ...webServerEnv() },
};

const gameStack = {
    command: `node ${path.join(REPO_ROOT, 'scripts', 'test-db', 'stack.js')}`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${SERVER_PORT}/livez`,
    reuseExistingServer: settings.reuseServer,
    timeout: SERVER_START_TIMEOUT_MS,
};

export default defineConfig({
    testDir: __dirname,
    testMatch: 'parity.spec.ts',
    outputDir: path.join(settings.imagesDir, 'playwright'),
    timeout: TEST_TIMEOUT_MS,
    // One worker: the seeded accounts play one live game at a time.
    workers: Number(process.env.PARITY_WORKERS || 1),
    fullyParallel: false,
    retries: 0,
    reporter: [['list']],
    globalSetup: path.join(__dirname, 'global-setup.ts'),
    globalTeardown: path.join(__dirname, 'global-teardown.ts'),
    use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1,
        baseURL: settings.baseURL,
        reducedMotion: 'reduce',
    },
    projects: PARITY_WIDTHS.map((width) => ({
        name: `chromium-${width}`,
        metadata: { width },
        use: { viewport: { width, height: VIEWPORT_HEIGHTS[width] } },
    })),
    webServer: withTestProject ? [gameStack, nextDev] : [nextDev],
});
