// Facts read off a FEN string. Pure.

const FIELDS = 6;
const TURN_FIELD = 1;
const FULLMOVE_FIELD = 5;

/**
 * Moves played to reach `fen` from the start, counted like a score sheet: a move by White starts a
 * new move number, so 1.e4 is 1 move and 1.e4 e5 is still 1. Null for a missing or malformed FEN.
 */
export function movesPlayed(fen: string | null | undefined): number | null {
    const fields = typeof fen === 'string' ? fen.trim().split(/\s+/) : [];
    if (fields.length !== FIELDS) return null;
    const fullmove = Number(fields[FULLMOVE_FIELD]);
    const turn = fields[TURN_FIELD];
    if (!Number.isInteger(fullmove) || fullmove < 1 || (turn !== 'w' && turn !== 'b')) return null;
    return turn === 'b' ? fullmove : fullmove - 1;
}
