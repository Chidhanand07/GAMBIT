import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { HERO_STATS, LANDING_ROUTES, type HeroStat } from '../landingContent';

function HeroStats({ stats }: { stats: readonly HeroStat[] }) {
    return (
        <div className="flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((stat) => (
                <span key={stat.label} className="flex items-baseline gap-2">
                    <span className="font-mono text-[22px] font-bold text-accent">{stat.value}</span>
                    <span className="text-[14px] text-ink-muted">{stat.label}</span>
                </span>
            ))}
        </div>
    );
}

function HeroCopy() {
    return (
        <div className="flex min-w-0 flex-[1_1_440px] flex-col items-start gap-7">
            <Pill dot dotTone="accent" size="md" className="px-[14px]">
                Free to play
            </Pill>
            <h1 className="m-0 font-display text-[length:clamp(52px,8vw,92px)] font-bold leading-[0.98] tracking-[-0.04em]">
                Chess,
                <br />
                <span className="text-accent">perfected.</span>
            </h1>
            <p className="m-0 max-w-[520px] text-[19px] leading-[1.6] text-ink-muted">
                A premium dark-mode chess platform with real-time matchmaking, engine analysis, and accuracy ratings.
            </p>
            <div className="flex flex-wrap gap-3">
                <Button href={LANDING_ROUTES.play} variant="primary-flat" size="2xl">
                    Play Now
                    <Icon name="chevronRight" />
                </Button>
                <Button href={LANDING_ROUTES.signUp} variant="secondary" size="2xl" className="gap-0">
                    Create Account
                </Button>
            </div>
            <HeroStats stats={HERO_STATS} />
        </div>
    );
}

interface HomeHeroProps {
    /** The hero board with its caption (HeroBoard). */
    board: ReactNode;
}

/** Landing hero (Home.dc.html): badge, headline, CTAs and claims on the left, the board on the right. */
export function HomeHero({ board }: HomeHeroProps) {
    return (
        <section className="flex flex-wrap items-center gap-x-16 gap-y-12">
            <HeroCopy />
            <div className="mx-auto flex min-w-0 max-w-[520px] flex-[1_1_380px] flex-col gap-[14px]">{board}</div>
        </section>
    );
}
