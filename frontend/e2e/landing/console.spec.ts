import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

// No console errors or warnings and no hydration mismatch on the landing page (F-115): through a
// first visit with the splash, a reload, a menu-free scroll to the footer and a replay.

test('a full visit logs nothing and hydrates cleanly', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Replay intro' }).click();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
});

test('hydration: the server HTML is what React renders (no mismatch, no client-only re-render of content)', async ({ page }) => {
    const problems = collectProblems(page);
    const response = await page.request.get('/');
    const html = await response.text();
    expect(html).toContain('Chess,');
    expect(html).toContain('Built for players who love the game');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(problems.filter((p) => /hydrat|did not match|server rendered/i.test(p))).toEqual([]);
    expect(problems).toEqual([]);
});
