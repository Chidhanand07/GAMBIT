import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test';

/** sessionStorage key of the intro splash (components/effects/IntroSplash.tsx). */
export const INTRO_SEEN_KEY = 'gambit_intro_seen';

/** Marks the intro as already seen in this session, so the page is not covered by it. */
export async function skipIntro(context: BrowserContext): Promise<void> {
    await context.addInitScript((key) => {
        try {
            window.sessionStorage.setItem(key, '1');
        } catch {
            // Storage blocked: the splash treats that as seen anyway.
        }
    }, INTRO_SEEN_KEY);
}

/** Every console error and warning, and every uncaught page error, from now on. */
export function collectProblems(page: Page): string[] {
    const problems: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    return problems;
}
