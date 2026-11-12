// @ts-check
/**
 * When a game is over, and who won (NODE-16). Pure: the caller passes the
 * position after a move (a chess.js board, with its history so repetition can
 * be seen) and gets a verdict or null. Clients never report results.
 */

/** Reasons shown to players in `game_end`. */
const REASON = Object.freeze({
    CHECKMATE: 'Checkmate',
    STALEMATE: 'Stalemate',
    INSUFFICIENT_MATERIAL: 'Insufficient material',
    THREEFOLD_REPETITION: 'Threefold repetition',
    FIFTY_MOVE_RULE: 'Fifty-move rule',
    RESIGNATION: 'Resignation',
    TIME: 'Time',
    ABANDONMENT: 'Abandonment',
    ABORTED: 'Aborted',
});

/**
 * @typedef {'white' | 'black'} Color
 * @typedef {{ winner: Color | null, reason: string, aborted?: boolean }} Verdict `winner` null is a draw,
 *   unless `aborted`: then no game was played and nothing is rated
 * @typedef {Pick<import('chess.js').Chess, 'turn' | 'isCheckmate' | 'isStalemate' | 'isInsufficientMaterial' |
 *   'isThreefoldRepetition' | 'isDrawByFiftyMoves'>} Position
 */

/**
 * The side that just moved (the opposite of the side to move).
 * @param {Position} position
 * @returns {Color}
 */
function sideThatMoved(position) {
    return position.turn() === 'w' ? 'black' : 'white';
}

/**
 * Ending rules in precedence order: the first one that applies decides. A new
 * way for a position to end the game is a new entry here (SOLID-03).
 * @type {ReadonlyArray<{ reason: string, applies: (p: Position) => boolean, winner: (p: Position) => Color | null }>}
 */
const RULES = [
    { reason: REASON.CHECKMATE, applies: (p) => p.isCheckmate(), winner: sideThatMoved },
    { reason: REASON.STALEMATE, applies: (p) => p.isStalemate(), winner: () => null },
    { reason: REASON.INSUFFICIENT_MATERIAL, applies: (p) => p.isInsufficientMaterial(), winner: () => null },
    { reason: REASON.THREEFOLD_REPETITION, applies: (p) => p.isThreefoldRepetition(), winner: () => null },
    { reason: REASON.FIFTY_MOVE_RULE, applies: (p) => p.isDrawByFiftyMoves(), winner: () => null },
];

/**
 * The verdict for `position`, or null while the game goes on.
 * @param {Position} position
 * @returns {Verdict | null}
 */
function adjudicate(position) {
    const rule = RULES.find((r) => r.applies(position));
    return rule ? { winner: rule.winner(position), reason: rule.reason } : null;
}

module.exports = { REASON, adjudicate };
