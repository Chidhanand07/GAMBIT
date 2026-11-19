import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { LEADERBOARD_SIZE, type LeaderboardTotals, type Standing } from '../leaderboardView';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function StandingCard({ standing: s, playHref }: { standing: Standing; playHref: string }) {
    return (
        <div className="box-border flex flex-col gap-3 rounded-20 border-1 border-line-strong bg-surface-raised p-5">
            <span className="text-[13px] font-medium text-ink-muted">Your standing</span>
            <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[44px] font-bold leading-none tracking-[-0.03em]">
                    {s.rank === null ? '—' : `#${s.rank}`}
                </span>
                <span className="font-mono text-[28px] font-bold leading-none text-accent">{s.rating}</span>
            </div>
            <span className="text-[14px] text-ink-muted">
                {`${s.name} · ${capitalize(s.bucket)} · ${s.games} games · ${s.winPct}% wins`}
            </span>
            <Link
                href={playHref}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-pill bg-accent px-5 font-semibold text-on-accent no-underline hover:text-on-accent"
            >
                <Icon name="play" size={16} />
                Play a game
            </Link>
        </div>
    );
}

function SummaryStat({ value, label }: { value: number; label: string }) {
    return (
        <div className="box-border flex min-w-0 flex-[1_1_140px] flex-col gap-[2px] rounded-20 border-1 border-line bg-surface px-5 py-[18px]">
            <span className="font-mono text-[32px] font-bold leading-[1.1] tracking-[-0.04em]">{value}</span>
            <span className="text-[14px] text-ink-muted">{label}</span>
        </div>
    );
}

interface StandingAsideProps {
    /** The signed-in viewer's standing; the card is left out for a guest. */
    standing: Standing | null;
    totals: LeaderboardTotals;
    onlineNow: number;
    playHref: string;
}

/**
 * Right column: the viewer's standing and the board totals. "Total players" is left out when the
 * count is unknown, and the mean rating says when it covers only the top players shown.
 */
export function StandingAside({ standing, totals, onlineNow, playHref }: StandingAsideProps) {
    return (
        <aside className="flex min-w-0 max-w-[520px] flex-[1_1_300px] flex-col gap-4">
            {standing && <StandingCard standing={standing} playHref={playHref} />}
            <div className="flex flex-wrap gap-3">
                {totals.players !== null && <SummaryStat value={totals.players} label="Total players" />}
                <SummaryStat
                    value={totals.avgRating}
                    label={totals.avgOfTop ? `Avg rating, top ${LEADERBOARD_SIZE}` : 'Avg rating'}
                />
                <SummaryStat value={onlineNow} label="Online now" />
            </div>
        </aside>
    );
}
