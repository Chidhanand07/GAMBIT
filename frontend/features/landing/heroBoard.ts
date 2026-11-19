// The landing board as plain data (design/Home.dc.html `baseVals()`): 64 squares, a8 first, each
// with its fill and piece. Pure, so the board renders on the server with no client JavaScript.
import type { Square } from 'chess.js';
import { BOARD_SIZE, parsePlacement, SQUARES, type PieceColor, type PieceType } from '@/components/chess/boardModel';

export type HeroSquareFill = 'light' | 'dark' | 'last-light' | 'last-dark';

export interface HeroSquare {
    square: Square;
    fill: HeroSquareFill;
    piece: { color: PieceColor; type: PieceType } | null;
}

interface HeroPosition {
    fen: string;
    lastMove: { from: string; to: string };
}

/** The squares of `position` in reading order; the last move's squares get the gold fills. */
export function heroSquares({ fen, lastMove }: HeroPosition): HeroSquare[] {
    const pieces = new Map(parsePlacement(fen).map((p) => [p.square, { color: p.color, type: p.type }]));
    return SQUARES.map((square, i) => {
        const light = (Math.floor(i / BOARD_SIZE) + (i % BOARD_SIZE)) % 2 === 0;
        const last = square === lastMove.from || square === lastMove.to;
        const tone = light ? 'light' : 'dark';
        return { square, fill: last ? `last-${tone}` : tone, piece: pieces.get(square) ?? null };
    });
}
