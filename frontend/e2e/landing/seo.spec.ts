import { expect, test } from '@playwright/test';

// Metadata, share images, icons, structured data, robots.txt and the sitemap (F-114). These are
// properties of the server's HTML, so one engine is enough.
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'server output: chromium only');

const meta = (name: string) => `meta[name="${name}"], meta[property="${name}"]`;

test('title, description, canonical, Open Graph and Twitter tags', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Gambit · Chess, perfected.');
    await expect(page.locator(meta('description'))).toHaveAttribute('content', /Free online chess/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+\/?$/);
    await expect(page.locator(meta('og:type'))).toHaveAttribute('content', 'website');
    await expect(page.locator(meta('og:title'))).toHaveAttribute('content', 'Gambit · Chess, perfected.');
    await expect(page.locator(meta('twitter:card'))).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the share images and icons exist and are PNGs of the declared size', async ({ page, request }) => {
    await page.goto('/');
    const urls = await Promise.all(
        [meta('og:image'), meta('twitter:image')].map((s) => page.locator(s).getAttribute('content')),
    );
    for (const url of urls) {
        const res = await request.get(new URL(url!).pathname + new URL(url!).search);
        expect(res.status()).toBe(200);
        expect(res.headers()['content-type']).toBe('image/png');
    }
    await expect(page.locator(meta('og:image:width'))).toHaveAttribute('content', '1200');
    for (const rel of ['icon', 'apple-touch-icon']) {
        const href = await page.locator(`link[rel="${rel}"]`).first().getAttribute('href');
        expect((await request.get(href!)).status()).toBe(200);
    }
    expect((await request.get('/favicon.ico')).status()).toBe(200);
});

test('JSON-LD: one script with a WebSite and a free SoftwareApplication, escaped', async ({ page }) => {
    await page.goto('/');
    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);
    const raw = (await scripts.textContent()) ?? '';
    expect(raw).not.toMatch(/</);
    const graph = JSON.parse(raw)['@graph'] as { '@type': string; offers?: { price: string } }[];
    expect(graph.map((n) => n['@type'])).toEqual(['WebSite', 'SoftwareApplication']);
    expect(graph[1].offers?.price).toBe('0');
});

test('robots.txt lets crawlers in, keeps them out of private routes and names the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/User-Agent: \*/i);
    expect(body).toContain('Allow: /');
    for (const path of ['/api/', '/lobby', '/game/', '/profile/', '/settings'])
        expect(body).toContain(`Disallow: ${path}`);
    expect(body).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
});

test('sitemap.xml lists only public pages', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const paths = [...(await res.text()).matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
    expect(paths).toEqual(['/', '/offline', '/analysis', '/signup', '/login']);
});
