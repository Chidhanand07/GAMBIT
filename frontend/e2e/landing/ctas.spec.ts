import { expect, test } from '@playwright/test';
import { skipIntro } from './helpers';

// Every call to action on the landing page, signed out (F-110). The signed-in variant is covered
// by the component tests (HomeSettingsPages, AppHeader); an end-to-end signed-in run needs the test
// Supabase project and is pending.

test.beforeEach(async ({ context }) => {
    await skipIntro(context);
});

test('hero: Play Now goes to the lobby, which asks a guest to sign in first', async ({ page }) => {
    await page.goto('/');
    const play = page.getByRole('link', { name: 'Play Now' });
    await expect(play).toHaveAttribute('href', '/lobby');
    await play.click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Flobby$/);
});

test('hero: Create Account opens sign-up', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Create Account', exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
});

test('header: Sign in and Create account', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'Create account', exact: true })).toHaveAttribute('href', '/signup');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
});

test('header: the logo and the main navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/lobby');
    await expect(nav.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', '/leaderboard');
    await expect(nav.getByRole('link', { name: 'Analysis' })).toHaveAttribute('href', '/analysis');
    await expect(page.getByRole('link', { name: /^Gambit/ }).first()).toHaveAttribute('href', '/');
});

const FOOTER = [
    { name: 'Play', href: '/lobby', lands: /\/login\?redirect=%2Flobby$/ },
    { name: 'Leaderboard', href: '/leaderboard', lands: /\/login\?redirect=%2Fleaderboard$/ },
    { name: 'Analysis', href: '/analysis', lands: /\/analysis$/ },
    { name: 'Offline', href: '/offline', lands: /\/offline$/ },
];

for (const link of FOOTER) {
    test(`footer: ${link.name} → ${link.href}`, async ({ page }) => {
        await page.goto('/');
        const footerLink = page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: link.name });
        await expect(footerLink).toHaveAttribute('href', link.href);
        await footerLink.click();
        await expect(page).toHaveURL(link.lands);
    });
}

test('Offline is the real "play the computer offline" page', async ({ page }) => {
    await page.goto('/offline');
    await expect(page).toHaveURL(/\/offline$/);
    await expect(page.locator('body')).not.toContainText('404');
});
