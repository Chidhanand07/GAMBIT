import { Icon } from '@/components/ui/Icon';
import { InfoRow } from '@/components/ui/InfoRow';
import { ANALYSIS_DEPTH } from '@/lib/api/analysis';
import { cn } from '@/lib/design/cn';
import { formatEvaluation } from '../evaluation';
import type { EngineAnalysis } from '../types';

const PV_SHOWN = 8;

export const ENGINE_NOTES = {
    off: 'Enable engine to evaluate the current position.',
    on: 'Engine on. Evaluating the current position.',
    failed: 'Engine unavailable. It will try again on the next move.',
} as const;

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

/**
 * The current evaluation as "Game info" rows (Game.dc.html, the design's label / value pattern):
 * score from White's view, best move, search depth and, when the engine sends one, the line.
 */
function Readout({ data }: { data: EngineAnalysis }) {
    return (
        <div aria-label="Engine evaluation" role="group" className="flex flex-col">
            <InfoRow label="Evaluation" value={formatEvaluation(data)} />
            <InfoRow label="Best move" value={data.best_move} />
            <InfoRow label="Depth" value={String(ANALYSIS_DEPTH)} />
            {data.pv && <InfoRow label="Line" value={data.pv.split(' ').slice(0, PV_SHOWN).join(' ')} wrap />}
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
