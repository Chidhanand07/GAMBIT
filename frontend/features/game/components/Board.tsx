'use client';

import type { Chess, Square as SquareId } from 'chess.js';
import { coordsToSq } from '@/lib/chess/board';
import type { SeatColor } from '@/types/game';
import type { GameOverInfo, MovePair } from '../state/gameReducer';
import PromotionModal from './PromotionModal';
import Square from './Square';

const WHITE_UP = [7, 6, 5, 4, 3, 2, 1, 0];
const BLACK_UP = [0, 1, 2, 3, 4, 5, 6, 7];

export interface BoardProps {
    displayChess: Chess;
    /** Live game state; check highlighting always uses it, even while viewing history. */
    liveChess: Chess;
    isLive: boolean;
    flipped: boolean;
    selectedSq: SquareId | null;
    legalDests: SquareId[];
    lastMove: MovePair | null;
    clickable: boolean;
    onSquareClick: (sq: SquareId) => void;
    pendingPromotion: MovePair | null;
    myColor: SeatColor;
    onPromote: (move: MovePair, piece: string) => void;
    gameOver: GameOverInfo | null;
}

export default function Board(props: BoardProps) {
    const { displayChess, liveChess, isLive, flipped, selectedSq, legalDests, lastMove, pendingPromotion } = props;
    const boardArray = displayChess.board();
    const ranks = flipped ? BLACK_UP : WHITE_UP;
    const files = flipped ? WHITE_UP : BLACK_UP;
    const checkedColor = isLive && liveChess.inCheck() ? liveChess.turn() : null;
    return (
        <div
            className="w-full aspect-square relative select-none"
            style={{ background: 'var(--frame-outer)', padding: '3px' }}
        >
            <div className="w-full h-full grid grid-cols-8 grid-rows-8 relative overflow-hidden rounded-sm">
                {ranks.map((rank) =>
                    files.map((file) => {
                        const sq = coordsToSq(file, rank);
                        const piece = boardArray[7 - rank][file];
                        return (
                            <Square
                                key={sq}
                                sq={sq}
                                file={file}
                                rank={rank}
                                piece={piece}
                                flipped={flipped}
                                isSelected={selectedSq === sq}
                                isLegal={legalDests.includes(sq)}
                                isLastMove={lastMove?.from === sq || lastMove?.to === sq}
                                isInCheck={piece?.type === 'k' && piece.color === checkedColor}
                                clickable={props.clickable}
                                onSquareClick={props.onSquareClick}
                            />
                        );
                    }),
                )}
            </div>

            {pendingPromotion && (
                <PromotionModal
                    color={props.myColor as 'white' | 'black'}
                    onSelect={(p) => props.onPromote(pendingPromotion, p)}
                />
            )}

            {/* subtle game-over board tint */}
            {props.gameOver && <div className="absolute inset-0 bg-black/15 z-10 pointer-events-none" />}
        </div>
    );
}
