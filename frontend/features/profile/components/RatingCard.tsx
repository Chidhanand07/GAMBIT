import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { SpeedBucket } from '@/types/timeControl';
import { PANEL, PANEL_TITLE } from './styles';

const MODES: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];
const MODE_ITEMS = MODES.map((m) => ({ id: m, label: SPEED_BUCKET_LABELS[m] }));
const GRID_LINES = [40, 80, 120];

interface RatingCardProps {
    mode: SpeedBucket;
    onMode: (mode: SpeedBucket) => void;
    /** Current rating in `mode`, rounded; null when the profile has none. */
    rating: number | null;
    /** Highest rating reached in `mode`; null when the profile has no peak (F12). */
    peak: number | null;
    /** Games played in `mode`, when the stats know it. */
    played: number | null;
}

function summary(peak: number | null, played: number | null): string {
    const parts: string[] = [];
    if (peak !== null) parts.push(`Peak ${peak}`);
    if (played !== null) parts.push(`${played} ${played === 1 ? 'game' : 'games'}`);
    return parts.join(' · ');
}

/**
 * "Rating over time": the mode switch, the current rating and its peak. No rating history is
 * stored per game yet, so the chart area keeps its grid and says so instead of drawing a line.
 */
export function RatingCard({ mode, onMode, rating, peak, played }: RatingCardProps) {
    const label = SPEED_BUCKET_LABELS[mode];
    return (
        <Card className={PANEL}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={PANEL_TITLE}>Rating over time</span>
                <Tabs label="Rating mode" tone="creamXs" items={MODE_ITEMS} value={mode} onChange={onMode} />
            </div>
            <div className="flex flex-wrap items-baseline gap-5">
                <span className="font-mono text-[36px] font-bold tracking-[-0.04em] text-accent">{rating ?? '—'}</span>
                <span className="text-[14px] text-ink-muted">{summary(peak, played)}</span>
            </div>
            <div className="relative h-[160px]">
                <svg viewBox="0 0 600 160" width="100%" height="160" aria-hidden="true" preserveAspectRatio="none">
                    {GRID_LINES.map((y) => (
                        <line key={y} x1="0" y1={y} x2="600" y2={y} className="stroke-line-subtle" />
                    ))}
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[14px] text-ink-muted">
                    {label} rating history is not recorded yet.
                </span>
            </div>
        </Card>
    );
}
