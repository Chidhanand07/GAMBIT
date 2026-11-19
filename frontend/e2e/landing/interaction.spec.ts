import { expect, test } from '@playwright/test';
import { skipIntro } from './helpers';

// INP lab proxy (F-115): the Event Timing API measures each interaction from input to the next
// paint. Chromium only (Event Timing is a Chromium API); the target is INP < 200 ms.
test.skip(({ browserName }) => browserName !== 'chromium', 'Event Timing API: Chromium only');

const INP_BUDGET_MS = 200;

/** An Event Timing entry; `interactionId` is set on entries that belong to a user interaction. */
type EventEntry = PerformanceEntry & { interactionId?: number };

test('Replay intro, Skip and the nav respond within the INP budget', async ({ page, context }) => {
    await skipIntro(context);
    await page.goto('/');
    await page.evaluate(() => {
        const w = window as unknown as { __durations: number[] };
        w.__durations = [];
        new PerformanceObserver((list) => {
            for (const e of list.getEntries() as EventEntry[]) if (e.interactionId) w.__durations.push(e.duration);
        }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    });
    await page.getByRole('button', { name: 'Replay intro' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboard' }).hover();
    await page.waitForTimeout(500);
    const durations = await page.evaluate(() => (window as unknown as { __durations: number[] }).__durations);
    const worst = Math.max(0, ...durations);
    test.info().annotations.push({ type: 'INP (worst interaction, ms)', description: String(worst) });
    expect(worst).toBeLessThan(INP_BUDGET_MS);
});
