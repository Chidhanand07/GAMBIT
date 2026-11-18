import { Icon } from '@/components/ui/Icon';
import { ANALYSIS_DEPTH } from '@/lib/api/analysis';
import { cn } from '@/lib/design/cn';
import { formatEvaluation } from '../evaluation';
import type { EngineAnalysis } from '../types';

/** Scores within ±0.2 pawns are shown as neutral. */
const NEUTRAL_BAND = 0.2;
const PV_SHOWN = 8;

export const ENGINE_NOTES = {
    off: 'Enable engine to evaluate the current position.',
    on: 'Engine on. Evaluating the current position.',
    failed: 'Engine unavailable. It will try again on the next move.',
} as const;

function scoreTone(score: number) {
    if (score > NEUTRAL_BAND) return 'text-success';
    return score < -NEUTRAL_BAND ? 'text-danger' : 'text-ink';
}

function EngineSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Engine"
            onClick={onToggle}
            className="flex h-11 w-14 shrink-0 items-center border-0 bg-transparent p-0"
        >
            <span
                className={cn(
                    'box-border flex h-8 w-14 items-center rounded-pill border-1.5 px-[3px]',
                    on ? 'justify-end border-accent bg-accent' : 'justify-start border-line-muted bg-bg-base',
                )}
            >
                <span className={cn('h-[22px] w-[22px] rounded-full', on ? 'bg-on-accent' : 'bg-ink')} />
            </span>
        </button>
    );
}

/** The current evaluation: score (White's view), best move, depth and the principal variation. */
function Readout({ data }: { data: EngineAnalysis }) {
    return (
        <div className="flex flex-col gap-1 rounded-12 border-1 border-line bg-bg-base px-[14px] py-3">
            <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-3">
                    <span className={cn('font-mono text-[18px] font-bold', scoreTone(data.score))}>
                        {formatEvaluation(data)}
                    </span>
                    <span className="text-[14px] text-ink-muted">
                        Best <span className="font-mono text-ink">{data.best_move}</span>
                    </span>
                </span>
                <span className="font-mono text-[13px] text-ink-faint">{`d${ANALYSIS_DEPTH}`}</span>
            </div>
            {data.pv && (
                <span className="font-mono text-[13px] text-ink-muted [overflow-wrap:anywhere]">
                    {data.pv.split(' ').slice(0, PV_SHOWN).join(' ')}
                </span>
            )}
        </div>
    );
}

interface EnginePanelProps {
    enabled: boolean;
    onToggle: () => void;
    data: EngineAnalysis | null;
    /** The last request failed (engine down, busy, or an unreadable answer). */
    failed: boolean;
}

/** Stockfish header with its note and on/off switch, then the evaluation when there is one. */
export function EnginePanel({ enabled, onToggle, data, failed }: EnginePanelProps) {
    const showFailure = enabled && failed;
    let note: string = enabled ? ENGINE_NOTES.on : ENGINE_NOTES.off;
    if (showFailure) note = ENGINE_NOTES.failed;
    return (
        <>
            <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 font-display text-[18px] font-semibold">
                        <Icon name="chart" className="text-accent" />
                        Stockfish 16
                    </span>
                    <span
                        role={showFailure ? 'alert' : undefined}
                        className={cn('text-[14px]', showFailure ? 'text-danger' : 'text-ink-muted')}
                    >
                        {note}
                    </span>
                </div>
                <EngineSwitch on={enabled} onToggle={onToggle} />
            </div>
            {enabled && data && <Readout data={data} />}
        </>
    );
}
