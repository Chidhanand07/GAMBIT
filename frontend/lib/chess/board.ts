// Board coordinate helpers. Files/ranks are 0-based: a1 = [0, 0], h8 = [7, 7].
import type { Square } from 'chess.js';

const CHAR_CODE_A = 97;

/** File letters in white's left-to-right order. */
export const FILES: readonly string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Rank digits in white's top-to-bottom order (8 first). */
export const RANKS: readonly string[] = ['8', '7', '6', '5', '4', '3', '2', '1'];

/** "e4" → [4, 3]. No validation: malformed input yields NaN/garbage like the original inline helper. */
export function sqToCoords(sq: string): [number, number] {
    return [sq.charCodeAt(0) - CHAR_CODE_A, parseInt(sq[1]) - 1];
}

/** (4, 3) → "e4". */
export function coordsToSq(file: number, rank: number): Square {
    return `${String.fromCharCode(CHAR_CODE_A + file)}${rank + 1}` as Square;
}
