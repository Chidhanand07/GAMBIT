import { formatEvaluation } from '../evaluation';
import type { EngineAnalysis } from '../types';

/** Evaluations beyond ±6 pawns fill the bar. */
const EVAL_CLAMP = 6;
const HALF = 50;

/** White's share of the bar in percent (50 with no evaluation). Pure. */
export function whiteShare(data: EngineAnalysis | null): number {
    const score = Math.max(-EVAL_CLAMP, Math.min(EVAL_CLAMP, data?.score ?? 0));
    return HALF + (score / EVAL_CLAMP) * HALF;
}

/** The 14px vertical evaluation bar beside the board (Analysis.dc.html), White at the bottom. */
export function EvalBar({ data }: { data: EngineAnalysis | null }) {
    const white = whiteShare(data);
    const label = data ? `Evaluation bar: ${formatEvaluation(data)}` : 'Evaluation bar: no evaluation';
    return (
        <div
            role="img"
            aria-label={label}
            className="box-content flex w-[14px] shrink-0 flex-col overflow-hidden rounded-pill border-1 border-line"
        >
            <span
                className="basis-0 bg-piece-glyph-black motion-safe:transition-[flex-grow] motion-safe:duration-500"
                style={{ flexGrow: 100 - white }}
            />
            <span
                className="basis-0 bg-ink motion-safe:transition-[flex-grow] motion-safe:duration-500"
                style={{ flexGrow: white }}
            />
        </div>
    );
}
