import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { SpeedBucket } from '@/types/timeControl';
import { CHART_HEIGHT, CHART_WIDTH, ratingChart, type RatingChart } from '../ratingChart';
import { PANEL, PANEL_TITLE } from './styles';

const MODES: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];
const MODE_ITEMS = MODES.map((m) => ({ id: m, label: SPEED_BUCKET_LABELS[m] }));
const GRID_LINES = [40, 80, 120];

interface RatingCardProps {
    mode: SpeedBucket;
    onMode: (mode: SpeedBucket) => void;
    /** Current rating in `mode`, rounded; null when the profile has none. */
    rating: number | null;
    /** Rating before the first recorded game, then after each one (F-121); empty or null without any. */
    history: readonly number[] | null;
}

const gamesText = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;

function ChartLines({ chart, label }: { chart: RatingChart; label: string }) {
    return (
        <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            width="100%"
            height={CHART_HEIGHT}
            role="img"
            aria-label={`${label} rating over the last ${gamesText(chart.games)}`}
            preserveAspectRatio="none"
        >
            {GRID_LINES.map((y) => (
                <line key={y} x1="0" y1={y} x2={CHART_WIDTH} y2={y} className="stroke-line-subtle" />
            ))}
            <path d={chart.area} className="fill-[var(--color-chart-area)]" />
            <path
                d={chart.line}
                fill="none"
                className="stroke-accent"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

/** The empty chart: grid lines and why there is no line (games before F-120 have no snapshot). */
function NoHistory({ label }: { label: string }) {
    return (
        <div className="relative h-[160px]">
            <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                width="100%"
                height={CHART_HEIGHT}
                aria-hidden="true"
                preserveAspectRatio="none"
            >
                {GRID_LINES.map((y) => (
                    <line key={y} x1="0" y1={y} x2={CHART_WIDTH} y2={y} className="stroke-line-subtle" />
                ))}
            </svg>
            <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-[14px] text-ink-muted">
                No {label.toLowerCase()} rating history yet. It is recorded for rated games from now on; earlier games
                have none.
            </span>
        </div>
    );
}

/** "Rating over time": the mode switch, the current rating, peak, low and change, and the chart. */
export function RatingCard({ mode, onMode, rating, history }: RatingCardProps) {
    const label = SPEED_BUCKET_LABELS[mode];
    const chart = ratingChart(history);
    return (
        <Card className={PANEL}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={PANEL_TITLE}>Rating over time</span>
                <Tabs label="Rating mode" tone="creamXs" items={MODE_ITEMS} value={mode} onChange={onMode} />
            </div>
            <div className="flex flex-wrap items-baseline gap-5">
                <span className="font-mono text-[36px] font-bold tracking-[-0.04em] text-accent">{rating ?? '—'}</span>
                {chart && (
                    <span className="text-[14px] text-ink-muted">
                        Peak {chart.peak} · Low {chart.low} · {chart.delta} over {gamesText(chart.games)}
                    </span>
                )}
            </div>
            {chart ? <ChartLines chart={chart} label={label} /> : <NoHistory label={label} />}
        </Card>
    );
}
