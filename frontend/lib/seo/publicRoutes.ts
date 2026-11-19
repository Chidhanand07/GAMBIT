// Which routes search engines may crawl (F-114). Public pages need no session; everything else is
// behind sign-in (proxy.ts matcher), per-user, or an API, and is kept out of robots and the sitemap.

/** Public pages, most important first. */
export const PUBLIC_PAGES = ['/', '/offline', '/analysis', '/signup', '/login'] as const;

/** Prefixes crawlers are asked to skip: signed-in pages, one-off links and the APIs. */
export const PRIVATE_PREFIXES = [
    '/api/',
    '/auth/',
    '/lobby',
    '/game/',
    '/profile/',
    '/leaderboard',
    '/settings',
    '/challenge/',
    '/join/',
    '/reset-password',
] as const;
