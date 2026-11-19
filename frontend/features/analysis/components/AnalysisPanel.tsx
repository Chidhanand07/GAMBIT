import type { ReactNode } from 'react';
import { MoveList } from '@/components/chess/MoveList';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';
import type { AnalysisTab } from '../types';

const TABS: readonly { id: AnalysisTab; label: string }[] = [
    { id: 'analysis', label: 'Analysis' },
    { id: 'import', label: 'Import' },
];

const COPY =
    'M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1';

function PanelTabs({ value, onChange }: { value: AnalysisTab; onChange: (t: AnalysisTab) => void }) {
    return (
        <div role="group" aria-label="Panel" className="flex gap-1 border-b-1 border-line bg-surface-header p-[6px]">
            {TABS.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    aria-pressed={t.id === value}
                    onClick={() => onChange(t.id)}
                    className={cn(
                        'min-h-[44px] flex-[1_1_0] rounded-pill border-0 text-[15px] font-semibold',
                        t.id === value ? 'bg-ink text-on-accent' : 'bg-transparent text-ink',
                    )}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

interface MovesProps {
    moves: readonly string[];
    currentPly: number;
    onSelectPly: (ply: number) => void;
}

/** The move list, or the dashed "No moves yet" well before there is one. */
export function MovesBox({ moves, currentPly, onSelectPly }: MovesProps) {
    if (moves.length > 0)
        return (
            <MoveList
                moves={moves}
                currentPly={currentPly}
                onSelectPly={onSelectPly}
                className="max-h-[360px] min-h-[220px] rounded-14 bg-bg-base"
            />
        );
    return (
        <div className="box-border flex min-h-[220px] flex-col items-center justify-center gap-1 rounded-14 border-1.5 border-dashed border-line-field px-5 py-7 text-center">
            <span className="font-semibold">No moves yet</span>
            <span className="text-[14px] text-ink-muted">Make a move or import a game to see the move list.</span>
        </div>
    );
}

/** The position's FEN with a copy button. */
export function FenBox({ fen, copied, onCopy }: { fen: string; copied: boolean; onCopy: () => void }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-ink-muted">FEN</span>
                <button
                    type="button"
                    onClick={onCopy}
                    className="flex min-h-[44px] items-center gap-2 rounded-pill border-1 border-line bg-surface-header px-4 text-[14px] font-semibold text-ink"
                >
                    <Icon path={COPY} size={16} />
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <code className="block rounded-12 border-1 border-line bg-bg-base px-[14px] py-3 font-mono text-[13px] leading-[1.6] text-ink [overflow-wrap:anywhere]">
                {fen}
            </code>
        </div>
    );
}

interface AnalysisPanelProps {
    tab: AnalysisTab;
    onTab: (t: AnalysisTab) => void;
    /** Body of the Analysis tab (engine, moves, FEN) and of the Import tab. */
    analysis: ReactNode;
    importer: ReactNode;
}

/** The right-hand card with its Analysis / Import switcher. */
export function AnalysisPanel({ tab, onTab, analysis, importer }: AnalysisPanelProps) {
    return (
        <aside className="flex min-w-0 max-w-[520px] flex-[1_1_340px] flex-col overflow-hidden rounded-20 border-1 border-line bg-surface">
            <PanelTabs value={tab} onChange={onTab} />
            {tab === 'analysis' ? <div className="flex flex-col gap-5 p-5">{analysis}</div> : importer}
        </aside>
    );
}
