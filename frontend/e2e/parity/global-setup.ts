/**
 * Before the run: empty the output folder and, when the TEST project is configured, sign every
 * seeded account in through the real /login form and save its storageState (git-ignored).
 */
import fs from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { settings } from './config/settings';
import { resetOutput } from './lib/results';
import { readAccounts, storageStatePath, testEnvStatus } from './lib/testEnv';

const ROLES = ['white', 'black', 'viewer'] as const;
const SIGN_IN_TIMEOUT_MS = 30000;

async function signIn(baseURL: string, role: (typeof ROLES)[number], email: string, password: string): Promise<void> {
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        await page.goto('/login');
        await page.locator('input[name="email"]').fill(email);
        await page.locator('input[name="password"]').fill(password);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: SIGN_IN_TIMEOUT_MS });
        await context.storageState({ path: storageStatePath(role) });
    } finally {
        await browser.close();
    }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
    resetOutput(settings.imagesDir, settings.resultsDir);
    if (!testEnvStatus().ok) return;
    fs.mkdirSync(settings.authDir, { recursive: true });
    const accounts = readAccounts();
    for (const role of ROLES) {
        const account = accounts[role];
        if (!account) throw new Error(`no seeded account for ${role}: run \`npm run test-db:seed\``);
        await signIn(settings.baseURL, role, account.email, account.password);
    }
}
