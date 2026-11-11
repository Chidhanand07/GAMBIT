import type { Dispatch, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import type { MoveClassification } from '@/types/game';
import { CLASS_META, uciToPretty } from '../review';
import { Ctrl } from './ReviewChrome';

function MovePill({ m, active, onClick }: { m: MoveClassification; active: boolean; onClick: () => void }) {
    const meta = CLASS_META[m.classification];
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${active ? 'bg-hover' : 'hover:bg-hover/50'}`}
        >
            <span className="text-text-primary w-14 text-left">{m.san}</span>
            {meta && (
                <span className="text-xs font-bold" style={{ color: meta.color }}>
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

/** Two-column move list under the board. */
export function ReviewMoveList({ moves, ply, onSeek }: MoveListProps) {
    return (
        <div className="mt-8 max-w-2xl mx-auto bg-surface border border-border rounded-xl p-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                    const w = moves[i * 2],
                        b = moves[i * 2 + 1];
                    return (
                        <div key={i} className="flex items-center gap-2 text-sm font-mono">
                            <span className="w-6 text-text-tertiary text-right">{i + 1}.</span>
                            {w && <MovePill m={w} active={ply === i * 2 + 1} onClick={() => onSeek(i * 2 + 1)} />}
                            {b && <MovePill m={b} active={ply === i * 2 + 2} onClick={() => onSeek(i * 2 + 2)} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** "e4 — Book · best was Nf3" caption for the current ply. */
export function MoveCaption({ curMove, prevFen }: { curMove: MoveClassification | null; prevFen: string | undefined }) {
    return (
        <div className="mt-3 h-6 text-center text-sm">
            {curMove ? (
                <span style={{ color: CLASS_META[curMove.classification]?.color }}>
                    {curMove.san} — {CLASS_META[curMove.classification]?.label || curMove.classification}
                    {curMove.best_move && curMove.classification !== 'Best' && curMove.classification !== 'Book' && (
                        <span className="text-text-tertiary">
                            {' '}
                            · best was {uciToPretty(prevFen, curMove.best_move)}
                        </span>
                    )}
                </span>
            ) : (
                <span className="text-text-tertiary">Starting position</span>
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
        <div className="flex items-center justify-center gap-2 mt-3">
            <Ctrl onClick={() => setPly(0)}>
                <SkipBack size={16} />
            </Ctrl>
            <Ctrl onClick={() => setPly((p) => Math.max(0, p - 1))}>
                <ChevronLeft size={16} />
            </Ctrl>
            <span className="text-sm text-text-secondary tabular-nums w-24 text-center">
                {ply} / {total}
            </span>
            <Ctrl onClick={() => setPly((p) => Math.min(total, p + 1))}>
                <ChevronRight size={16} />
            </Ctrl>
            <Ctrl onClick={() => setPly(total)}>
                <SkipForward size={16} />
            </Ctrl>
            <Ctrl onClick={() => setFlipped((f) => !f)}>⟲</Ctrl>
        </div>
    );
}
