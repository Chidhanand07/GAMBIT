import type { Square } from 'chess.js';
import { Board } from '@/components/chess/Board';
import { gridPosition } from '@/components/chess/boardModel';
import { preferredBoardProps } from '@/features/settings/boardProps';
import { useBoardPrefs } from '@/features/settings/SettingsProvider';
import type { MoveClassification } from '@/types/game';
import { CLASS_META, moveHighlights } from '../review';

interface ReviewBoardProps {
    fen: string;
    flipped: boolean;
    curMove: MoveClassification | null;
}

const CELL = 12.5;

/** A ring on the engine's best move squares (not shown where the played move already is). */
function BestMoveRing({ square, flipped }: { square: Square; flipped: boolean }) {
    const { col, row } = gridPosition(square, flipped ? 'black' : 'white');
    return (
        <span
            aria-hidden="true"
            data-best={square}
            className="pointer-events-none absolute h-[12.5%] w-[12.5%] shadow-best-move"
            style={{ left: `${col * CELL}%`, top: `${row * CELL}%` }}
        />
    );
}

/**
 * The review board: the shared game board (Game.dc.html) with the played move highlighted, a
 * ring on the engine's best move and the move's classification badge.
 */
export function ReviewBoard({ fen, flipped, curMove }: ReviewBoardProps) {
    const { lastFrom, lastTo, bestFrom, bestTo } = moveHighlights(curMove);
    const lastMove = lastFrom && lastTo ? { from: lastFrom as Square, to: lastTo as Square } : null;
    const rings = [bestFrom, bestTo].filter((sq): sq is string => !!sq && sq !== lastFrom && sq !== lastTo);
    const badge = curMove ? CLASS_META[curMove.classification] : undefined;
    const prefs = useBoardPrefs();
    return (
        <div className="relative">
            <Board
                fen={fen}
                orientation={flipped ? 'black' : 'white'}
                {...preferredBoardProps(prefs, { lastMove })}
                label="Review board"
            >
                {rings.map((sq) => (
                    <BestMoveRing key={sq} square={sq as Square} flipped={flipped} />
                ))}
            </Board>
            {badge && (
                <span
                    data-classification
                    className="absolute -right-3 -top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-ink-bright shadow-popover"
                    style={{ background: badge.color }}
                >
                    {badge.sym}
                </span>
            )}
        </div>
    );
}
