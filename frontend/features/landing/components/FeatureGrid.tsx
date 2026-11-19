import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { FEATURES, type LandingFeature } from '../landingContent';

function FeatureCard({ feature }: { feature: LandingFeature }) {
    return (
        <Card as="div" className="fc flex flex-col gap-3 p-6">
            <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-14 bg-surface-raised text-accent"
            >
                <Icon name={feature.icon} size={22} />
            </span>
            <h3 className="m-0 font-display text-[20px] font-semibold leading-[1.5] tracking-normal">
                {feature.title}
            </h3>
            <p className="m-0 leading-[1.6] text-ink-muted">{feature.body}</p>
        </Card>
    );
}

/** "Why Gambit": the six feature cards (Home.dc.html). */
export function FeatureGrid() {
    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-accent">Why Gambit</span>
                <h2 className="m-0 font-display text-[40px] font-bold leading-[1.1] tracking-[-0.03em]">
                    Built for players who love the game
                </h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
                {FEATURES.map((feature) => (
                    <FeatureCard key={feature.title} feature={feature} />
                ))}
            </div>
        </section>
    );
}
