import type { Metadata } from 'next';
import { LandingPage } from '@/features/landing/components/LandingPage';
import { LANDING_DESCRIPTION, LANDING_TITLE, SITE_NAME } from '@/features/landing/siteCopy';
import { getViewer } from '@/lib/server/viewer';

// Share images come from app/opengraph-image.tsx and app/twitter-image.tsx (file conventions).
export const metadata: Metadata = {
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: '/',
        siteName: SITE_NAME,
        title: LANDING_TITLE,
        description: LANDING_DESCRIPTION,
        locale: 'en_US',
    },
    twitter: { card: 'summary_large_image', title: LANDING_TITLE, description: LANDING_DESCRIPTION },
};

/** The landing page (design/Home.dc.html, F-110). Rendered per request: it depends on the viewer (F-112). */
export default async function Home() {
    return <LandingPage viewer={await getViewer()} />;
}
