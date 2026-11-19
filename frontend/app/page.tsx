import { LandingPage } from '@/features/landing/components/LandingPage';
import { getViewer } from '@/lib/server/viewer';

/** The landing page (design/Home.dc.html, F-110). Rendered per request: it depends on the viewer (F-112). */
export default async function Home() {
    return <LandingPage viewer={await getViewer()} />;
}
