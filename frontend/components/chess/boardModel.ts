// Pure board helpers for components/chess/Board.tsx: FEN placement parsing, piece identity across
// positions (so a moved piece slides instead of popping), and square ⇄ grid geometry.
import type { Square } from 'chess.js';

export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type BoardOrientation = 'white' | 'black';

export interface PlacedPiece {
    /** Stable across positions while the same piece stays on the board. */
    id: string;
    square: Square;
    color: PieceColor;
    type: PieceType;
}

export const BOARD_SIZE = 8;
const FILES = 'abcdefgh';
const PIECE_LETTERS = 'pnbrqk';

/** All 64 squares, a8 first, in white's reading order. */
export const SQUARES: readonly Square[] = Array.from(
    { length: BOARD_SIZE * BOARD_SIZE },
    (_, i) => `${FILES[i % BOARD_SIZE]}${BOARD_SIZE - Math.floor(i / BOARD_SIZE)}` as Square,
);

const pieceFrom = (ch: string): Pick<PlacedPiece, 'color' | 'type'> | null => {
    const lower = ch.toLowerCase();
    if (!PIECE_LETTERS.includes(lower)) return null;
    return { color: ch === lower ? 'b' : 'w', type: lower as PieceType };
};

/** The pieces in a FEN (or just its placement field), without ids, a8 → h1. */
export function parsePlacement(fen: string): Omit<PlacedPiece, 'id'>[] {
    const placement = fen.trim().split(/\s+/)[0] ?? '';
    const pieces: Omit<PlacedPiece, 'id'>[] = [];
    placement.split('/').forEach((row, r) => {
        let file = 0;
        for (const ch of row) {
            const piece = pieceFrom(ch);
            if (piece) pieces.push({ ...piece, square: `${FILES[file]}${BOARD_SIZE - r}` as Square });
            file += piece ? 1 : Number(ch) || 0;
        }
    });
    return pieces;
}

/** File and rank indexes, 0-based: a1 = [0, 0]. */
export function squareCoords(square: Square): [number, number] {
    return [FILES.indexOf(square[0]), Number(square[1]) - 1];
}

/** Column and row on screen (0-based from the top-left) for the given orientation. */
export function gridPosition(square: Square, orientation: BoardOrientation): { col: number; row: number } {
    const [file, rank] = squareCoords(square);
    const last = BOARD_SIZE - 1;
    return orientation === 'white' ? { col: file, row: last - rank } : { col: last - file, row: rank };
}

/** Squares in on-screen order (top-left first) for the given orientation. */
export function squaresFor(orientation: BoardOrientation): readonly Square[] {
    return orientation === 'white' ? SQUARES : [...SQUARES].reverse();
}

const distance = (a: Square, b: Square) => {
    const [af, ar] = squareCoords(a);
    const [bf, br] = squareCoords(b);
    return Math.abs(af - bf) + Math.abs(ar - br);
};

function freshId(base: string, taken: Set<string>): string {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}~${n}`;
    taken.add(id);
    return id;
}

/** Takes the closest unmatched previous piece of the same colour and type, if any. */
function takeNearest(pool: PlacedPiece[], piece: Omit<PlacedPiece, 'id'>): PlacedPiece | undefined {
    let best = -1;
    pool.forEach((p, i) => {
        if (p.color !== piece.color || p.type !== piece.type) return;
        if (best < 0 || distance(p.square, piece.square) < distance(pool[best].square, piece.square)) best = i;
    });
    return best < 0 ? undefined : pool.splice(best, 1)[0];
}

/**
 * Gives the pieces of `next` ids, reusing `previous` ids: first for pieces that did not move, then
 * for the nearest piece of the same colour and type (the one that moved, so it slides). Pieces
 * that appear from nowhere (a promotion, a new position) get new ids; captured ones drop out.
 */
export function assignPieceIds(
    previous: readonly PlacedPiece[],
    next: readonly Omit<PlacedPiece, 'id'>[],
): PlacedPiece[] {
    const bySquare = new Map(previous.map((p) => [p.square, p]));
    const pool = [...previous];
    const result: (PlacedPiece | null)[] = next.map((piece) => {
        const stayed = bySquare.get(piece.square);
        if (!stayed || stayed.color !== piece.color || stayed.type !== piece.type) return null;
        pool.splice(pool.indexOf(stayed), 1);
        return stayed;
    });
    const taken = new Set(previous.map((p) => p.id));
    return next.map((piece, i) => {
        const kept = result[i] ?? takeNearest(pool, piece);
        return { ...piece, id: kept ? kept.id : freshId(`${piece.color}${piece.type}-${piece.square}`, taken) };
    });
}
