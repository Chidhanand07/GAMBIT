import { CLASS_META, CLASS_ORDER } from '@/features/game-result/review';
import { cn } from '@/lib/design/cn';
import type { AnalysisSide } from '@/types/gameAnalysis';
import type { GameAnalysisState } from '../hooks/useGameAnalysis';

/** "Best 12 · Inaccuracy 2", in the review page's order; only classes that occur. */
export function classificationSummary(side: AnalysisSide): string {
    const counts = new Map<string, number>();
    for (const m of side.moves) counts.set(m.classification, (counts.get(m.classification) ?? 0) + 1);
    return CLASS_ORDER.filter((c) => counts.get(c))
        .map((c) => `${CLASS_META[c].label} ${counts.get(c)}`)
        .join(' · ');
}

function SideRow({ side, color }: { side: AnalysisSide; color: 'White' | 'Black' }) {
    const summary = classificationSummary(side);
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
                <span
                    aria-hidden="true"
                    className={cn(
                        'box-content h-3 w-3 shrink-0 rounded-3 border-1 border-line-muted',
                        color === 'White' ? 'bg-ink' : 'bg-on-accent',
                    )}
                />
                <span className="min-w-0 flex-1 font-semibold">{side.name ?? color}</span>
                <span className="font-mono text-[18px] font-bold text-accent">
                    {side.accuracy === null ? '—' : `${side.accuracy.toFixed(1)}%`}
                </span>
            </div>
            {summary && <span className="text-[13px] text-ink-muted">{summary}</span>}
        </div>
    );
}

/**
 * The game the page was opened with (/analysis?game=<id>): each side's stored accuracy and move
 * classifications, in the panel's well style (Analysis.dc.html). Nothing for a free board.
 */
export function GameReviewPanel({ state }: { state: GameAnalysisState }) {
    if (state.status === 'none') return null;
    if (state.status === 'loading') return <span className="text-[14px] text-ink-muted">Loading the game…</span>;
    if (state.status === 'error')
        return (
            <span role="alert" className="text-[14px] text-danger">
                {state.error}
            </span>
        );
    const { white, black } = state.game;
    const reviewed = white.accuracy !== null || black.accuracy !== null;
    return (
        <section aria-label="Game review" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="m-0 font-display text-[18px] font-semibold">Game review</h2>
                <span className="text-[13px] text-ink-muted">Accuracy</span>
            </div>
            <div className="flex flex-col gap-3 rounded-12 border-1 border-line bg-bg-base px-[14px] py-3">
                <SideRow side={white} color="White" />
                <SideRow side={black} color="Black" />
            </div>
            {!reviewed && (
                <span className="text-[13px] text-ink-muted">This game has not been reviewed by the engine yet.</span>
            )}
        </section>
    );
}
