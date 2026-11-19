// The public origin of the web app, for canonical links, Open Graph URLs, robots.txt and the
// sitemap (F-114). NEXT_PUBLIC_SITE_URL is the source (DEPLOY.md §5b); it is not a secret.

const LOCAL_ORIGIN = 'http://localhost:3000';

/** `raw` as an http(s) origin ("https://gambit.example"), or null when it is not one. */
export function originOf(raw: string | undefined): string | null {
    if (!raw) return null;
    try {
        const url = new URL(raw.trim());
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
    } catch {
        return null;
    }
}

/**
 * NEXT_PUBLIC_SITE_URL, else Vercel's production domain (set by the platform), else localhost.
 * Read at call time so tests and builds see the current environment.
 */
export function siteOrigin(): string {
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return (
        originOf(process.env.NEXT_PUBLIC_SITE_URL) ?? originOf(vercel ? `https://${vercel}` : undefined) ?? LOCAL_ORIGIN
    );
}

/** An absolute URL on this site for `path` ("/" → "https://gambit.example/"). */
export function siteUrl(path = '/'): string {
    return new URL(path, siteOrigin()).toString();
}
