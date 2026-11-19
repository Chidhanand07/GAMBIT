import { originOf, siteOrigin, siteUrl } from '@/lib/siteUrl';

const ENV = { ...process.env };
afterEach(() => {
    process.env = { ...ENV };
});

describe('site URL (F-114)', () => {
    test('originOf keeps only an http(s) origin', () => {
        expect(originOf('https://gambit.example/some/path?q=1')).toBe('https://gambit.example');
        expect(originOf(' http://localhost:3203 ')).toBe('http://localhost:3203');
        expect(originOf('javascript:alert(1)')).toBeNull();
        expect(originOf('not a url')).toBeNull();
        expect(originOf(undefined)).toBeNull();
    });

    test('NEXT_PUBLIC_SITE_URL first, then the Vercel production domain, then localhost', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://gambit.example/';
        process.env.VERCEL_PROJECT_PRODUCTION_URL = 'gambit.vercel.app';
        expect(siteOrigin()).toBe('https://gambit.example');
        delete process.env.NEXT_PUBLIC_SITE_URL;
        expect(siteOrigin()).toBe('https://gambit.vercel.app');
        delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
        expect(siteOrigin()).toBe('http://localhost:3000');
    });

    test('siteUrl joins a path onto the origin', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://gambit.example';
        expect(siteUrl()).toBe('https://gambit.example/');
        expect(siteUrl('/sitemap.xml')).toBe('https://gambit.example/sitemap.xml');
    });
});
