// Text forms of an engine evaluation (pure).
import type { EngineAnalysis } from './types';

type Evaluation = Pick<EngineAnalysis, 'score' | 'mate'>;

/** "+0.3", "-1.3", or "M3" / "-M3" for a forced mate. */
export function formatEvaluation({ score, mate }: Evaluation): string {
    if (mate !== null) return `${mate < 0 ? '-' : ''}M${Math.abs(mate)}`;
    return `${score > 0 ? '+' : ''}${score.toFixed(1)}`;
}

/** Unsigned eval-bar label: "1.3", or "M3" for a forced mate. */
export function barLabel({ score, mate }: Evaluation): string {
    return mate !== null ? `M${Math.abs(mate)}` : Math.abs(score).toFixed(1);
}
