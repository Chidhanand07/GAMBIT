import type { MetadataRoute } from 'next';
import { PRIVATE_PREFIXES } from '@/lib/seo/publicRoutes';
import { siteOrigin, siteUrl } from '@/lib/siteUrl';

/** /robots.txt: crawl the public pages, skip the private ones, find the sitemap (F-114). */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] },
        sitemap: siteUrl('/sitemap.xml'),
        host: siteOrigin(),
    };
}
