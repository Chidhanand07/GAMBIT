import { BarChart2 } from 'lucide-react';
import { ANALYSIS_DEPTH } from '@/lib/api/analysis';
import { formatEvaluation } from '../evaluation';
import type { EngineAnalysis } from '../types';

/** Scores within ±0.2 pawns are shown as neutral. */
const NEUTRAL_BAND = 0.2;
const PV_SHOWN = 8;

function scoreColor(score: number, neutral: string) {
    if (score > NEUTRAL_BAND) return 'var(--green)';
    return score < -NEUTRAL_BAND ? 'var(--red)' : neutral;
}

function EngineUnavailable() {
    return (
        <p className="text-xs py-1" style={{ color: 'var(--red)' }}>
            Engine unavailable. It will try again on the next move.
        </p>
    );
}

function EngineResult({ data }: { data: EngineAnalysis }) {
    return (
        <div
            className="rounded-lg p-3"
            style={{
                background: 'var(--bg-elevated)',
                border: `0.5px solid var(--border)`,
                borderLeft: `2px solid ${scoreColor(data.score, 'var(--text-tertiary)')}`,
            }}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span
                        className="text-base font-bold tabular-nums"
                        style={{ color: scoreColor(data.score, 'var(--text-secondary)') }}
                    >
                        {formatEvaluation(data)}
                    </span>
                    <span className="text-sm font-medium text-accent">{data.best_move}</span>
                </div>
            </div>
            {data.pv && (
                <div className="flex flex-wrap gap-1">
                    {data.pv
                        .split(' ')
                        .slice(0, PV_SHOWN)
                        .map((m, mi) => (
                            <span
                                key={mi}
                                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                style={{
                                    color: 'var(--text-secondary)',
                                    background: 'var(--bg-surface)',
                                    border: '0.5px solid var(--border)',
                                }}
                            >
                                {m}
                            </span>
                        ))}
                </div>
            )}
        </div>
    );
}

function Analyzing() {
    return (
        <div className="flex items-center gap-2 text-sm py-1" style={{ color: 'var(--text-tertiary)' }}>
            <div
                className="w-3.5 h-3.5 border-2 rounded-full animate-spin shrink-0"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
            />
            Analyzing position…
        </div>
    );
}

function EngineStatus({ data, failed }: { data: EngineAnalysis | null; failed: boolean }) {
    if (data) return <EngineResult data={data} />;
    return failed ? <EngineUnavailable /> : <Analyzing />;
}

interface EnginePanelProps {
    enabled: boolean;
    onToggle: () => void;
    data: EngineAnalysis | null;
    /** The last request failed (engine down, busy, or an unreadable answer). */
    failed: boolean;
}

/** Stockfish header with the on/off switch and the current evaluation. */
export function EnginePanel({ enabled, onToggle, data, failed }: EnginePanelProps) {
    return (
        <div className="shrink-0 p-3 space-y-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart2 size={14} className="text-accent" strokeWidth={1.5} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Stockfish 16
                    </span>
                    {enabled && (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{
                                color: 'var(--text-tertiary)',
                                background: 'var(--bg-elevated)',
                                border: '0.5px solid var(--border)',
                            }}
                        >
                            {`d${ANALYSIS_DEPTH}`}
                        </span>
                    )}
                </div>
                <button
                    onClick={onToggle}
                    className="w-9 h-5 rounded-full relative transition-colors"
                    style={{
                        background: enabled ? 'var(--accent)' : 'var(--bg-elevated)',
                        border: '0.5px solid var(--border-strong)',
                    }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ left: enabled ? 'calc(100% - 18px)' : '2px' }}
                    />
                </button>
            </div>

            {enabled && <EngineStatus data={data} failed={failed} />}

            {!enabled && (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Enable engine to evaluate the current position.
                </p>
            )}
        </div>
    );
}
