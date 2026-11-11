import { Chess, type Square } from 'chess.js';
import Piece from '@/components/ui/Piece';
import { FILES, RANKS } from '@/lib/chess/board';
import type { MoveClassification } from '@/types/game';
import { CLASS_META, moveHighlights } from '../review';

interface ReviewBoardProps {
    fen: string;
    flipped: boolean;
    curMove: MoveClassification | null;
}

/** Static review board: last-move highlight, best-move ring and the classification badge. */
export function ReviewBoard({ fen, flipped, curMove }: ReviewBoardProps) {
    const orderedRanks = flipped ? [...RANKS].reverse() : RANKS;
    const orderedFiles = flipped ? [...FILES].reverse() : FILES;
    const chess = new Chess(fen);

    const { lastFrom, lastTo, bestFrom, bestTo } = moveHighlights(curMove);
    const badge = curMove ? CLASS_META[curMove.classification] : undefined;

    return (
        <div className="w-full relative border-[10px] border-[#2E2B25] rounded-sm shadow-[-8px_8px_24px_rgba(0,0,0,0.5)]">
            <div className="grid grid-cols-8 grid-rows-8 w-full aspect-square">
                {orderedRanks.map((r) =>
                    orderedFiles.map((f) => {
                        const sq = f + r;
                        const piece = chess.get(sq as Square);
                        const isLight = (FILES.indexOf(f) + RANKS.indexOf(r)) % 2 === 0;
                        const isLast = sq === lastFrom || sq === lastTo;
                        const isBest = sq === bestFrom || sq === bestTo;
                        return (
                            <div
                                key={sq}
                                className={`relative w-full aspect-square flex items-center justify-center ${isLight ? 'bg-board-light' : 'bg-board-dark'}`}
                            >
                                {isLast && <div className="absolute inset-0 bg-yellow-400/35" />}
                                {isBest && !isLast && (
                                    <div className="absolute inset-0 ring-4 ring-inset ring-[#749B4F]/70" />
                                )}
                                {piece && (
                                    <div className="w-full h-full flex items-center justify-center z-10">
                                        <Piece color={piece.color} type={piece.type} />
                                    </div>
                                )}
                            </div>
                        );
                    }),
                )}
            </div>
            {/* classification badge for current move */}
            {curMove && badge && (
                <div
                    className="absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg z-20"
                    style={{ background: badge.color }}
                >
                    {badge.sym}
                </div>
            )}
        </div>
    );
}
