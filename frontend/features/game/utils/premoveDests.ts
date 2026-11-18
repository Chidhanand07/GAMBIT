// Where a piece could go on its next move whatever the opponent does first: the squares a
// premove may target (ADR F-153). Geometric only — other pieces do not block, because the
// opponent's move can open or close lines; the server checks legality when it plays it.
import type { Square } from 'chess.js';
import type { PlayerColor } from '@/types/game';

type Step = readonly [number, number];
type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

const FILES = 'abcdefgh';
const BOARD = 8;
const KNIGHT: readonly Step[] = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
];
const DIAGONAL: readonly Step[] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];
const STRAIGHT: readonly Step[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];
const ALL = [...DIAGONAL, ...STRAIGHT];
const SLIDES: Partial<Record<PieceKind, readonly Step[]>> = { b: DIAGONAL, r: STRAIGHT, q: ALL };
/** Rank index (0 = rank 1) a pawn starts on, and its forward direction. */
const PAWN = { white: { start: 1, dir: 1 }, black: { start: 6, dir: -1 } } as const;
/** The king's home square and the squares it castles to. */
const CASTLING = { white: { home: 'e1', to: ['g1', 'c1'] }, black: { home: 'e8', to: ['g8', 'c8'] } } as const;

const onBoard = (file: number, rank: number) => file >= 0 && file < BOARD && rank >= 0 && rank < BOARD;
const name = (file: number, rank: number) => `${FILES[file]}${rank + 1}` as Square;

function steps(file: number, rank: number, deltas: readonly Step[], slide: boolean): Square[] {
    const out: Square[] = [];
    for (const [df, dr] of deltas) {
        for (let f = file + df, r = rank + dr; onBoard(f, r); f += df, r += dr) {
            out.push(name(f, r));
            if (!slide) break;
        }
    }
    return out;
}

function pawnDests(file: number, rank: number, color: PlayerColor): Square[] {
    const { start, dir } = PAWN[color];
    const forward: Step[] = [
        [0, dir],
        [-1, dir],
        [1, dir],
    ];
    if (rank === start) forward.push([0, 2 * dir]);
    return steps(file, rank, forward, false);
}

/** Premove destinations of a `kind` piece of `color` on `from`. */
export function premoveDests(from: Square, kind: PieceKind, color: PlayerColor): Square[] {
    const file = FILES.indexOf(from[0]);
    const rank = Number(from[1]) - 1;
    if (kind === 'p') return pawnDests(file, rank, color);
    if (kind === 'n') return steps(file, rank, KNIGHT, false);
    if (kind === 'k') {
        const castle = CASTLING[color];
        return [...steps(file, rank, ALL, false), ...(from === castle.home ? castle.to : [])];
    }
    return steps(file, rank, SLIDES[kind] ?? [], true);
}

/** A pawn premoved to the last rank promotes; premoves always promote to a queen. */
export function premovePromotion(kind: PieceKind, to: Square): 'q' | undefined {
    return kind === 'p' && (to[1] === '1' || to[1] === '8') ? 'q' : undefined;
}
