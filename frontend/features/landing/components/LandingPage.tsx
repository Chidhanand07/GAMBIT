import IntroSplash from '@/components/effects/IntroSplash';
import { SeededAppHeader } from '@/features/navigation/components/AppHeaderContainer';
import type { Viewer } from '@/types/viewer';
import { FeatureGrid } from './FeatureGrid';
import { HeroBoard } from './HeroBoard';
import { HomeFooter } from './HomeFooter';
import { HomeHero } from './HomeHero';
import { StructuredData } from './StructuredData';

/**
 * The landing page (design/Home.dc.html, F-110): intro splash, header, hero, "Why Gambit" and the
 * footer. A Server Component: only the splash and the header hydrate. `viewer` comes from the
 * verified session, so the header and the calls to action are right on the first paint (F-112).
 */
export function LandingPage({ viewer }: { viewer: Viewer }) {
    return (
        <>
            <IntroSplash />
            <SeededAppHeader viewer={viewer} />
            <div id="top" className="mx-auto box-border flex max-w-[1280px] flex-col gap-24 px-8 pb-8 pt-16">
                <HomeHero viewer={viewer} board={<HeroBoard />} />
                <FeatureGrid />
            </div>
            <HomeFooter />
            <StructuredData />
        </>
    );
}
