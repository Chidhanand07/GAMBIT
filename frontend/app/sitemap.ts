import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES } from '@/lib/seo/publicRoutes';
import { siteUrl } from '@/lib/siteUrl';

/** The landing gets the top priority; the other public pages share the next one down. */
const PRIORITY = { landing: 1, other: 0.6 } as const;

/** /sitemap.xml: the public pages only (F-114). */
export default function sitemap(): MetadataRoute.Sitemap {
    return PUBLIC_PAGES.map((page) => ({
        url: siteUrl(page),
        changeFrequency: 'monthly',
        priority: page === '/' ? PRIORITY.landing : PRIORITY.other,
    }));
}
