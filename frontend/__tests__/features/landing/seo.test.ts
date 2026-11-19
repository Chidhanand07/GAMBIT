import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { PRIVATE_PREFIXES, PUBLIC_PAGES } from '@/lib/seo/publicRoutes';

const ENV = { ...process.env };
beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://gambit.example';
});
afterEach(() => {
    process.env = { ...ENV };
});

describe('robots.txt and sitemap.xml (F-114)', () => {
    test('robots allows the site, keeps crawlers out of private routes and points at the sitemap', () => {
        const r = robots();
        expect(r.rules).toEqual({ userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] });
        expect(r.sitemap).toBe('https://gambit.example/sitemap.xml');
        expect(PRIVATE_PREFIXES).toEqual(expect.arrayContaining(['/api/', '/lobby', '/game/', '/profile/', '/settings']));
    });

    test('the sitemap lists the public pages only, the landing first with the top priority', () => {
        const entries = sitemap();
        expect(entries.map((e) => e.url)).toEqual(PUBLIC_PAGES.map((p) => `https://gambit.example${p}`));
        expect(entries[0]).toMatchObject({ url: 'https://gambit.example/', priority: 1 });
        for (const page of PUBLIC_PAGES) {
            expect(PRIVATE_PREFIXES.some((prefix) => page.startsWith(prefix))).toBe(false);
        }
    });
});
