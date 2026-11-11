'use client';

import type { Chess, Square as SquareId } from 'chess.js';
import Piece from '@/components/ui/Piece';

type BoardCell = ReturnType<Chess['board']>[number][number];

const CHAR_CODE_A = 97;
const LAST_INDEX = 7;

export interface SquareProps {
    sq: SquareId;
    file: number;
    rank: number;
    piece: BoardCell;
    flipped: boolean;
    isSelected: boolean;
    isLegal: boolean;
    isLastMove: boolean;
    isInCheck: boolean;
    clickable: boolean;
    onSquareClick: (sq: SquareId) => void;
}

interface HighlightFlags {
    isLight: boolean;
    isSelected: boolean;
    isLastMove: boolean;
    isInCheck: boolean;
}

/** Selected > last-move tint > plain; a king in check overrides everything. */
export function squareBackground({ isLight, isSelected, isLastMove, isInCheck }: HighlightFlags): string {
    let bg = isLight ? 'var(--board-light)' : 'var(--board-dark)';
    if (isSelected) bg = 'rgba(250,250,100,0.55)';
    else if (isLastMove) bg = isLight ? 'rgba(196,150,90,0.5)' : 'rgba(196,150,90,0.4)';
    if (isInCheck) bg = 'rgba(192,57,43,0.75)';
    return bg;
}

/** Legal-move dot (empty square) or ring (capture), then the piece image. */
function SquareContents({ isLegal, piece }: { isLegal: boolean; piece: BoardCell }) {
    return (
        <>
            {isLegal && !piece && <div className="w-[28%] h-[28%] rounded-full bg-black/20 pointer-events-none" />}
            {isLegal && piece && (
                <div className="absolute inset-0 rounded-sm ring-[5px] ring-inset ring-black/25 pointer-events-none" />
            )}
            {piece && <Piece color={piece.color} type={piece.type} />}
        </>
    );
}

export default function Square({
    sq,
    file,
    rank,
    piece,
    flipped,
    isLegal,
    clickable,
    onSquareClick,
    ...flags
}: SquareProps) {
    const isLight = (file + rank) % 2 === 1;
    const labelColor = isLight ? 'var(--board-dark)' : 'var(--board-light)';
    const edge = flipped ? LAST_INDEX : 0;
    return (
        <div
            onClick={() => onSquareClick(sq)}
            className={`relative flex items-center justify-center transition-colors duration-100 ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
            style={{ background: squareBackground({ isLight, ...flags }) }}
        >
            {file === edge && (
                <span
                    className="absolute top-0.5 left-1 text-[10px] font-medium z-10 pointer-events-none"
                    style={{ color: labelColor, opacity: 0.8 }}
                >
                    {rank + 1}
                </span>
            )}
            {rank === edge && (
                <span
                    className="absolute bottom-0.5 right-1 text-[10px] font-medium z-10 pointer-events-none"
                    style={{ color: labelColor, opacity: 0.8 }}
                >
                    {String.fromCharCode(CHAR_CODE_A + file)}
                </span>
            )}
            <SquareContents isLegal={isLegal} piece={piece} />
        </div>
    );
}
