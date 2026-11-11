import type { EngineAnalysis } from '../types';

/** Evaluations beyond ±6 pawns fill the bar. */
const EVAL_CLAMP = 6;
/** Below this magnitude no number is shown. */
const EVAL_LABEL_MIN = 0.15;

/** Vertical evaluation bar (desktop only). */
export function EvalBar({ engineData }: { engineData: EngineAnalysis | null }) {
    const evalScore = engineData?.score ?? 0;
    const clampedEval = Math.max(-EVAL_CLAMP, Math.min(EVAL_CLAMP, evalScore));
    const whitePct = 50 + (clampedEval / EVAL_CLAMP) * 50;
    return (
        <div
            className="w-8 shrink-0 mx-3 my-4 flex flex-col rounded-xl overflow-hidden relative hidden lg:flex"
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}
        >
            {/* Black section */}
            <div
                className="transition-all duration-500 shrink-0 flex items-center justify-center"
                style={{ height: `${100 - whitePct}%`, background: '#1C1C1C', minHeight: 12 }}
            >
                {engineData && evalScore < -EVAL_LABEL_MIN && (
                    <span
                        className="text-[9px] font-mono tabular-nums writing-mode-vertical"
                        style={{
                            color: '#E8DDD0',
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            padding: '4px 0',
                        }}
                    >
                        {Math.abs(evalScore).toFixed(1)}
                    </span>
                )}
            </div>
            {/* White section */}
            <div
                className="transition-all duration-500 shrink-0 flex items-end justify-center"
                style={{ height: `${whitePct}%`, background: '#EDE0CC', minHeight: 12 }}
            >
                {engineData && evalScore > EVAL_LABEL_MIN && (
                    <span
                        className="text-[9px] font-mono tabular-nums"
                        style={{ color: '#1C1C1C', writingMode: 'vertical-rl', padding: '4px 0' }}
                    >
                        +{evalScore.toFixed(1)}
                    </span>
                )}
            </div>
            {/* Labels */}
            <div
                className="absolute top-2 left-0 right-0 text-center text-[8px] font-semibold pointer-events-none"
                style={{ color: 'rgba(232,221,204,0.5)' }}
            >
                B
            </div>
            <div
                className="absolute bottom-2 left-0 right-0 text-center text-[8px] font-semibold pointer-events-none"
                style={{ color: 'rgba(28,28,28,0.5)' }}
            >
                W
            </div>
        </div>
    );
}
