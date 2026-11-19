import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import type { Viewer } from '@/types/viewer';
import { HERO_STATS, heroCtas, type HeroStat } from '../landingContent';

/**
 * JetBrains Mono has no ∞ in the subsets Google serves, so the mockup draws it with the next font
 * in its stack (`ui-monospace, monospace`). Skipping next/font's metric-matched Arial fallback for
 * that one glyph keeps the same face; the digits and "Free" keep the fallback.
 */
const MONO_GLYPH_FALLBACK = 'font-[ui-monospace,monospace]';

function StatValue({ value }: { value: string }) {
    return (
        <span className="font-mono text-[22px] font-bold text-accent">
            {value === '∞' ? <span className={MONO_GLYPH_FALLBACK}>{value}</span> : value}
        </span>
    );
}

function HeroStats({ stats }: { stats: readonly HeroStat[] }) {
    return (
        <div className="flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((stat) => (
                <span key={stat.label} className="flex items-baseline gap-2">
                    <StatValue value={stat.value} />
                    <span className="text-[14px] text-ink-muted">{stat.label}</span>
                </span>
            ))}
        </div>
    );
}

function HeroActions({ viewer }: { viewer: Viewer }) {
    const { primary, secondary } = heroCtas(viewer);
    return (
        <div className="flex flex-wrap gap-3">
            <Button href={primary.href} variant="primary-flat" size="2xl">
                {primary.label}
                <Icon name="chevronRight" />
            </Button>
            {/* content-box as in the mockup: 56px plus the 1px border = 58px, and Play Now stretches to match. */}
            {secondary && (
                <Button href={secondary.href} variant="secondary" size="2xl" className="box-content gap-0">
                    {secondary.label}
                </Button>
            )}
        </div>
    );
}

function HeroCopy({ viewer }: { viewer: Viewer }) {
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
            <HeroActions viewer={viewer} />
            <HeroStats stats={HERO_STATS} />
        </div>
    );
}

interface HomeHeroProps {
    /** Who is looking: picks the second call to action (F-110). */
    viewer: Viewer;
    /** The hero board with its caption (HeroBoard). */
    board: ReactNode;
}

/** Landing hero (Home.dc.html): badge, headline, CTAs and claims on the left, the board on the right. */
export function HomeHero({ viewer, board }: HomeHeroProps) {
    return (
        <section className="flex flex-wrap items-center gap-x-16 gap-y-12">
            <HeroCopy viewer={viewer} />
            <div className="mx-auto flex min-w-0 max-w-[520px] flex-[1_1_380px] flex-col gap-[14px]">{board}</div>
        </section>
    );
}
