import type { Dispatch, SetStateAction } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/design/cn';
import type { MoveClassification } from '@/types/game';
import { GAME_ICONS } from '@/features/game/components/gameIcons';
import { CLASS_META, uciToPretty } from '../review';
import { Ctrl } from './ReviewChrome';

const ICONS = {
    first: 'M19 20 9 12l10-8zM5 19V5',
    prev: 'M15 18l-6-6 6-6',
    next: 'M9 18l6-6-6-6',
    last: 'M5 4l10 8-10 8zM19 5v14',
};

function MovePill({ m, active, onClick }: { m: MoveClassification; active: boolean; onClick: () => void }) {
    const meta = CLASS_META[m.classification];
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'step' : undefined}
            className={cn(
                'flex items-center gap-1 rounded-10 border-0 bg-transparent px-[6px] py-[2px] font-mono',
                active ? 'bg-surface-raised text-accent' : 'text-ink',
            )}
        >
            <span className="w-14 text-left">{m.san}</span>
            {meta && (
                <span className="text-[12px] font-bold" style={{ color: meta.color }}>
                    {meta.sym}
                </span>
            )}
        </button>
    );
}

interface MoveListProps {
    moves: MoveClassification[];
    ply: number;
    onSeek: (p: number) => void;
}

/** The "Moves" card (Game.dc.html), with each move's classification symbol. */
export function ReviewMoveList({ moves, ply, onSeek }: MoveListProps) {
    return (
        <Card aria-label="Moves" className="flex flex-col overflow-hidden p-0">
            <div className="border-b-1 border-line-subtle px-5 py-[14px] font-display text-[17px] font-semibold">
                Moves
            </div>
            <div className="max-h-[420px] overflow-y-auto py-1">
                {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                    const w = moves[i * 2],
                        b = moves[i * 2 + 1];
                    return (
                        <div key={i} className="grid grid-cols-[36px_1fr_1fr] gap-2 px-5 py-1 text-[14px]">
                            <span className="py-[2px] font-mono text-ink-faint">{i + 1}.</span>
                            {w ? (
                                <MovePill m={w} active={ply === i * 2 + 1} onClick={() => onSeek(i * 2 + 1)} />
                            ) : (
                                <span />
                            )}
                            {b && <MovePill m={b} active={ply === i * 2 + 2} onClick={() => onSeek(i * 2 + 2)} />}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

/** "e4 — Book · best was Nf3" caption for the current ply. */
export function MoveCaption({ curMove, prevFen }: { curMove: MoveClassification | null; prevFen: string | undefined }) {
    return (
        <div aria-live="polite" className="min-h-6 text-center text-[14px]">
            {curMove ? (
                <span style={{ color: CLASS_META[curMove.classification]?.color }}>
                    {curMove.san} — {CLASS_META[curMove.classification]?.label || curMove.classification}
                    {curMove.best_move && curMove.classification !== 'Best' && curMove.classification !== 'Book' && (
                        <span className="text-ink-faint"> · best was {uciToPretty(prevFen, curMove.best_move)}</span>
                    )}
                </span>
            ) : (
                <span className="text-ink-faint">Starting position</span>
            )}
        </div>
    );
}

interface ControlsProps {
    ply: number;
    total: number;
    setPly: Dispatch<SetStateAction<number>>;
    setFlipped: Dispatch<SetStateAction<boolean>>;
}

export function ReviewControls({ ply, total, setPly, setFlipped }: ControlsProps) {
    return (
        <div className="flex items-center justify-center gap-2">
            <Ctrl label="First move" iconPath={ICONS.first} onClick={() => setPly(0)} />
            <Ctrl label="Previous move" iconPath={ICONS.prev} onClick={() => setPly((p) => Math.max(0, p - 1))} />
            <span className="w-24 text-center font-mono text-[14px] font-bold text-ink-muted">
                {ply} / {total}
            </span>
            <Ctrl label="Next move" iconPath={ICONS.next} onClick={() => setPly((p) => Math.min(total, p + 1))} />
            <Ctrl label="Last move" iconPath={ICONS.last} onClick={() => setPly(total)} />
            <Ctrl label="Flip board" iconPath={GAME_ICONS.flip} onClick={() => setFlipped((f) => !f)} />
        </div>
    );
}
