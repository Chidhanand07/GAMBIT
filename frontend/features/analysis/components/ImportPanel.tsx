import { cn } from '@/lib/design/cn';
import { QUICK_POSITIONS, isShowing, type QuickPosition } from '../quickPositions';

const HEADING = 'font-display text-[18px] font-semibold';
const FIELD =
    'box-border w-full resize-y rounded-12 border-1 border-line-field bg-bg-base px-[14px] py-3 font-mono text-[14px] leading-[1.6] text-ink placeholder:text-ink-placeholder focus:border-accent focus:shadow-focus-ring focus:outline-none';
const STATUS = 'min-h-[20px] text-[14px] text-success-ink';

function QuickButton({ q, on, onPick }: { q: QuickPosition; on: boolean; onPick: (q: QuickPosition) => void }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={() => onPick(q)}
            className={cn(
                'min-h-[48px] rounded-14 border-1.5 px-[14px] text-left text-[15px] font-semibold',
                on ? 'border-accent bg-accent text-on-accent' : 'border-line-field bg-surface-header text-ink',
            )}
        >
            {q.name}
        </button>
    );
}

export interface ImportPanelProps {
    /** The board's FEN, to mark the preset it shows. */
    currentFen: string;
    customFen: string;
    onCustomFen: (v: string) => void;
    customPgn: string;
    onCustomPgn: (v: string) => void;
    fenMessage: string;
    pgnMessage: string;
    onQuickPosition: (q: QuickPosition) => void;
    onLoadFen: () => void;
    onLoadPgn: () => void;
}

/** Quick positions, "Load from FEN" and "Import game (PGN)" (Analysis.dc.html Import tab). */
export function ImportPanel(p: ImportPanelProps) {
    return (
        <div className="flex flex-col gap-6 p-5">
            <section className="flex flex-col gap-3">
                <h2 className={cn('m-0', HEADING)}>Quick positions</h2>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                    {QUICK_POSITIONS.map((q) => (
                        <QuickButton key={q.name} q={q} on={isShowing(q, p.currentFen)} onPick={p.onQuickPosition} />
                    ))}
                </div>
            </section>
            <section className="flex flex-col gap-3">
                <label htmlFor="fen" className={HEADING}>
                    Load from FEN
                </label>
                <textarea
                    id="fen"
                    rows={3}
                    placeholder="Paste FEN string…"
                    value={p.customFen}
                    onChange={(e) => p.onCustomFen(e.target.value)}
                    className={FIELD}
                />
                <button
                    type="button"
                    onClick={p.onLoadFen}
                    className="min-h-[52px] rounded-pill border-0 bg-accent text-[16px] font-semibold text-on-accent"
                >
                    Load position
                </button>
                <span role="status" className={STATUS}>
                    {p.fenMessage}
                </span>
            </section>
            <section className="flex flex-col gap-3">
                <label htmlFor="pgn" className={HEADING}>
                    Import game (PGN)
                </label>
                <textarea
                    id="pgn"
                    rows={7}
                    placeholder="Paste PGN… 1. e4 e5 2. Nf3 Nc6"
                    value={p.customPgn}
                    onChange={(e) => p.onCustomPgn(e.target.value)}
                    className={FIELD}
                />
                <button
                    type="button"
                    onClick={p.onLoadPgn}
                    className="min-h-[52px] rounded-pill border-1.5 border-line-muted bg-transparent text-[16px] font-semibold text-ink"
                >
                    Import game
                </button>
                <span role="status" className={STATUS}>
                    {p.pgnMessage}
                </span>
            </section>
        </div>
    );
}
