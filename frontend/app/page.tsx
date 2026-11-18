import IntroSplash from '@/components/effects/IntroSplash';
import { FeatureGrid } from '@/features/landing/components/FeatureGrid';
import { HeroBoard } from '@/features/landing/components/HeroBoard';
import { HomeFooter } from '@/features/landing/components/HomeFooter';
import { HomeHero } from '@/features/landing/components/HomeHero';

/** The landing page (design/Home.dc.html); the header comes from the root layout. */
export default function Home() {
    return (
        <>
            <IntroSplash />
            <div
                id="top"
                className="mx-auto box-border flex max-w-[1280px] flex-col gap-24 px-8 pb-8 pt-16"
            >
                <HomeHero board={<HeroBoard />} />
                <FeatureGrid />
            </div>
            <HomeFooter />
        </>
    );
}
