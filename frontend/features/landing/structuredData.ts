// JSON-LD for the landing page (F-114): a WebSite and the SoftwareApplication it is. Every value
// is a fact of the app: free (no paid tier), runs in the browser, chess.
import { LANDING_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from './siteCopy';

type JsonLd = Record<string, unknown>;

/** The landing's structured data for `origin` ("https://gambit.example"). */
export function landingStructuredData(origin: string): JsonLd {
    const home = `${origin}/`;
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${home}#website`,
                url: home,
                name: SITE_NAME,
                alternateName: `${SITE_NAME}: ${SITE_TAGLINE}`,
                description: LANDING_DESCRIPTION,
                inLanguage: 'en',
            },
            {
                '@type': 'SoftwareApplication',
                '@id': `${home}#app`,
                name: SITE_NAME,
                url: home,
                description: LANDING_DESCRIPTION,
                applicationCategory: 'GameApplication',
                applicationSubCategory: 'Chess',
                operatingSystem: 'Web browser',
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
        ],
    };
}

/**
 * JSON for a `<script type="application/ld+json">` body: `<`, `>` and `&` are escaped so no value
 * can close the script element or open a comment, and U+2028/U+2029 so old parsers cannot break.
 */
export function serializeJsonLd(data: JsonLd): string {
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
