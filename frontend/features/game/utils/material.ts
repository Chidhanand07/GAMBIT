// Captured pieces and the material balance of a position (Game.dc.html captures line and
// "Material" row). Read from the FEN, so it is right for any position, live or in history.
import type { PieceType } from '@/components/chess/boardModel';

type Side = 'w' | 'b';
type CapturablePiece = Exclude<PieceType, 'k'>;

/** Most valuable first: the order captures are listed in. */
const CAPTURABLE: readonly CapturablePiece[] = ['q', 'r', 'b', 'n', 'p'];
const START_COUNT: Record<CapturablePiece, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
export const PIECE_VALUE: Record<PieceType, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
/** Captured-piece glyphs (the solid set, as in the mockup), drawn in Noto Sans Symbols 2. */
const GLYPH: Record<CapturablePiece, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export interface MaterialBalance {
    /** Pieces each side has taken from the other, most valuable first. */
    capturedBy: Record<Side, CapturablePiece[]>;
    /** White's material minus black's, in pawns. */
    advantage: number;
}

function countPieces(fen: string): Record<Side, Record<PieceType, number>> {
    const empty = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 });
    const counts = { w: empty(), b: empty() };
    for (const ch of fen.split(' ')[0] ?? '') {
        const type = ch.toLowerCase() as PieceType;
        if (!(type in PIECE_VALUE)) continue;
        counts[ch === type ? 'b' : 'w'][type] += 1;
    }
    return counts;
}

/** Pieces beyond the starting count are promoted pawns: those pawns were not captured. */
const promotions = (have: Record<PieceType, number>) =>
    CAPTURABLE.reduce((sum, t) => sum + (t === 'p' ? 0 : Math.max(0, have[t] - START_COUNT[t])), 0);

function missing(have: Record<PieceType, number>): CapturablePiece[] {
    const gone = (t: CapturablePiece) => START_COUNT[t] - have[t] - (t === 'p' ? promotions(have) : 0);
    return CAPTURABLE.flatMap((t) => Array<CapturablePiece>(Math.max(0, gone(t))).fill(t));
}

const material = (have: Record<PieceType, number>) => CAPTURABLE.reduce((sum, t) => sum + PIECE_VALUE[t] * have[t], 0);

export function materialBalance(fen: string): MaterialBalance {
    const counts = countPieces(fen);
    return {
        capturedBy: { w: missing(counts.b), b: missing(counts.w) },
        advantage: material(counts.w) - material(counts.b),
    };
}

/** "♛♞♟ +3": the glyphs of the pieces taken, plus the lead when this side is ahead. */
export function capturesText(pieces: readonly CapturablePiece[], lead: number): string {
    return pieces.map((t) => GLYPH[t]).join('') + (lead > 0 ? ` +${lead}` : '');
}

/** Number of captures played so far (SAN with an "x"). */
export const captureCount = (sans: readonly string[]) => sans.filter((san) => san.includes('x')).length;
