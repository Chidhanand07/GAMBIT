import { expect, test } from '@playwright/test';

// The intro splash (Home.dc.html; F-113): once per session, skippable, never under reduced motion.

const splash = '[data-testid="intro-splash"]';

test('plays on the first visit, Skip ends it, and it does not play again in the session', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(splash)).toBeVisible();
    await expect(page.getByRole('img', { name: 'GAMBIT', exact: true })).toBeAttached();
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.locator(splash)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator(splash)).toHaveCount(0);
});

test('Escape ends it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(splash)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(splash)).toHaveCount(0);
});

test('it ends by itself after the fade-out (4.9 s + 0.7 s)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(splash)).toBeVisible();
    await expect(page.locator(splash)).toHaveCount(0, { timeout: 9_000 });
});

test('Replay intro plays it again; its hit area is 44px tall while it is drawn 40px', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip' }).click();
    const replay = page.getByRole('button', { name: 'Replay intro' });
    const box = await replay.boundingBox();
    expect(box?.height).toBe(40);
    // The point 1px below the drawn button still belongs to it (the ::before strip).
    const hit = await replay.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const below = document.elementFromPoint(r.left + r.width / 2, r.bottom + 1);
        const above = document.elementFromPoint(r.left + r.width / 2, r.top - 1);
        return [below === el, above === el];
    });
    expect(hit).toEqual([true, true]);
    await replay.click();
    await expect(page.locator(splash)).toBeVisible();
});

test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('never shows the splash, and Replay does nothing', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator(splash)).toHaveCount(0);
        await page.getByRole('button', { name: 'Replay intro' }).click();
        await expect(page.locator(splash)).toHaveCount(0);
    });
});
