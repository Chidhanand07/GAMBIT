/**
 * src/services/originPolicy.js — the one allow-list of browser origins for Express CORS and the
 * Socket.IO handshake [S13] (NODE-09).
 */
const { createOriginPolicy } = require('../../src/services/originPolicy');
const { parseOrigins } = require('../../src/config/origins');

describe('parseOrigins (CORS_ORIGINS)', () => {
    test('a comma-separated list of exact origins, trimmed, without trailing slashes', () => {
        expect(parseOrigins(' https://gambit.app , https://www.gambit.app/ ,http://localhost:3000')).toEqual([
            'https://gambit.app',
            'https://www.gambit.app',
            'http://localhost:3000',
        ]);
    });

    test.each([
        ['a wildcard', '*'],
        ['a pattern', 'https://*.vercel.app'],
        ['a path', 'https://gambit.app/lobby'],
        ['no scheme', 'gambit.app'],
        ['another scheme', 'ftp://gambit.app'],
    ])('refuses %s at startup (fail fast)', (_label, value) => {
        expect(() => parseOrigins(value)).toThrow(/CORS_ORIGINS/);
    });

    test('empty → []', () => expect(parseOrigins('')).toEqual([]));
});

describe('createOriginPolicy', () => {
    const PREVIEWS = '^https://gambit-[a-z0-9-]+-chidhanand07s-projects\\.vercel\\.app$';

    test('exact origins only: no prefix, suffix or case games', () => {
        const policy = createOriginPolicy({ origins: ['https://gambit.app'] });
        expect(policy.isAllowed('https://gambit.app')).toBe(true);
        for (const other of ['https://gambit.app.evil.com', 'https://evil-gambit.app', 'http://gambit.app', 'https://GAMBIT.app', 'null', '']) {
            expect(policy.isAllowed(other)).toBe(false);
        }
    });

    test('any *.vercel.app origin is no longer allowed by itself', () => {
        const policy = createOriginPolicy({ origins: ['https://gambit.app'] });
        expect(policy.isAllowed('https://anyone-else.vercel.app')).toBe(false);
    });

    test("an optional pattern admits this project's preview deployments only", () => {
        const policy = createOriginPolicy({ origins: [], previewPattern: PREVIEWS });
        expect(policy.isAllowed('https://gambit-git-fix-x-chidhanand07s-projects.vercel.app')).toBe(true);
        expect(policy.isAllowed('https://evil.vercel.app')).toBe(false);
        expect(policy.isAllowed('https://gambit-x-chidhanand07s-projects.vercel.app.evil.com')).toBe(false);
    });

    test.each([
        ['not anchored', 'https://gambit-.*\\.vercel\\.app'],
        ['any vercel.app subdomain', '^https://.*\\.vercel\\.app$'],
        ['any subdomain via [^.]', '^https://[^.]+\\.vercel\\.app$'],
        ['not https', '^http://gambit-[a-z]+\\.vercel\\.app$'],
        ['not a vercel.app host', '^https://gambit-[a-z]+\\.example\\.com$'],
        ['not a regex', '^https://(gambit\\.vercel\\.app$'],
    ])('refuses a preview pattern that is %s (fail fast)', (_label, pattern) => {
        expect(() => createOriginPolicy({ origins: [], previewPattern: pattern })).toThrow(/CORS_PREVIEW_ORIGIN_REGEX/);
    });

    test('a request without an Origin header (curl, server-to-server) is not a browser: allowed', () => {
        const policy = createOriginPolicy({ origins: [] });
        expect(policy.allowsRequest(undefined)).toBe(true);
        expect(policy.allowsRequest('https://evil.example.com')).toBe(false);
    });
});
