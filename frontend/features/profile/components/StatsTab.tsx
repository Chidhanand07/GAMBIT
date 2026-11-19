import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { cn } from '@/lib/design/cn';
import { SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { ProfileStats } from '@/types/profilePage';
import type { SpeedBucket } from '@/types/timeControl';
import { colourRows, statFacts, type ColourRow } from '../model';
import { EMPTY, PANEL, PANEL_TITLE } from './styles';

const DEFAULT_RATING = 1200;
const MODES: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];

function Totals({ stats }: { stats: ProfileStats }) {
    return (
        <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <StatTile value={String(stats.total ?? 0)} label="Total games" />
            <StatTile value={String(stats.wins ?? 0)} label="Wins" tone="success" />
            <StatTile value={String(stats.losses ?? 0)} label="Losses" tone="danger" />
            <StatTile value={String(stats.draws ?? 0)} label="Draws" tone="muted" />
        </section>
    );
}

function ColourBar({ row }: { row: ColourRow }) {
    return (
        <div className="flex flex-col gap-[6px]">
            <div className="flex justify-between text-[14px]">
                <span className="flex items-center gap-2">
                    <span
                        aria-hidden="true"
                        className={cn(
                            'box-content h-3 w-3 rounded-4 border-1 border-line-muted',
                            row.name === 'White' ? 'bg-ink' : 'bg-on-accent',
                        )}
                    />
                    {row.name}
                </span>
                <span className="font-mono text-ink-muted">
                    {row.record} · {row.rate}
                </span>
            </div>
            <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-pill bg-bg-base">
                <span className="bg-success" style={{ width: row.w }} />
                <span className="bg-ink-muted" style={{ width: row.d }} />
                <span className="bg-danger" style={{ width: row.l }} />
            </div>
        </div>
    );
}

function ModeCard({ mode, stats }: { mode: SpeedBucket; stats: ProfileStats }) {
    const rec = stats.byCategory?.[mode] ?? { played: 0, wins: 0, losses: 0, draws: 0 };
    return (
        <div className="box-border flex flex-col gap-[10px] rounded-20 border-1 border-line bg-surface p-5">
            <span className="text-[14px] font-semibold text-ink-muted">{SPEED_BUCKET_LABELS[mode]}</span>
            <span className="font-mono text-[36px] font-bold leading-none tracking-[-0.04em]">
                {Math.round(stats.ratings?.[mode] ?? DEFAULT_RATING)}
            </span>
            <div className="grid grid-cols-[1fr_auto] gap-y-1 text-[14px] text-ink-muted">
                <span>Played</span>
                <span className="font-mono text-ink">{rec.played}</span>
                <span>Wins</span>
                <span className="font-mono text-success">{rec.wins}</span>
                <span>Losses</span>
                <span className="font-mono text-danger">{rec.losses}</span>
                <span>Draws</span>
                <span className="font-mono">{rec.draws}</span>
            </div>
        </div>
    );
}

function StatsBody({ stats, rating }: { stats: ProfileStats; rating: ReactNode }) {
    const colours = colourRows(stats);
    const facts = statFacts(stats);
    return (
        <>
            <Totals stats={stats} />
            {rating}
            {colours.length > 0 && (
                <Card className={PANEL}>
                    <span className={PANEL_TITLE}>Results by colour</span>
                    {colours.map((row) => (
                        <ColourBar key={row.name} row={row} />
                    ))}
                </Card>
            )}
            {facts.length > 0 && (
                <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
                    {facts.map((f) => (
                        <div
                            key={f.k}
                            className="box-border flex flex-col gap-1 rounded-20 border-1 border-line bg-surface px-5 py-4"
                        >
                            <span className="font-mono text-[24px] font-bold">{f.v}</span>
                            <span className="text-[13px] text-ink-muted">{f.k}</span>
                        </div>
                    ))}
                </section>
            )}
            <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                {MODES.map((m) => (
                    <ModeCard key={m} mode={m} stats={stats} />
                ))}
            </section>
        </>
    );
}

interface StatsTabProps {
    stats: ProfileStats | null;
    failed: boolean;
    onRetry: () => void;
    /** The "Rating over time" card (composed by the page). */
    rating: ReactNode;
}

/** Totals, rating card, results by colour, facts and per-mode cards; an error with Retry on failure (F12). */
export function StatsTab({ stats, failed, onRetry, rating }: StatsTabProps) {
    if (failed) {
        return (
            <Card className="flex flex-col items-center gap-3 p-7 text-center">
                <span className="text-ink-muted">Could not load stats.</span>
                <Button variant="outline" onClick={onRetry}>
                    Retry
                </Button>
            </Card>
        );
    }
    if (!stats) return <div className={EMPTY}>Loading stats…</div>;
    return <StatsBody stats={stats} rating={rating} />;
}
