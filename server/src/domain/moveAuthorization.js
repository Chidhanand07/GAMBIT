// @ts-check
/**
 * Who may move in a game, and when (NODE-11). Pure: decided from the stored
 * game state and the verified user id only.
 */
const { activeSideFromFen } = require('./gameState');
const { playerIdOf, sideToColor } = require('./result');

/** Reasons sent to the client in `move_rejected`. */
const REJECTION = Object.freeze({
    GAME_NOT_FOUND: 'game_not_found',
    GAME_NOT_ACTIVE: 'game_not_active',
    NOT_A_PLAYER: 'not_a_player',
    NOT_YOUR_TURN: 'not_your_turn',
    ILLEGAL_MOVE: 'illegal_move',
});

/**
 * @typedef {{ status: string, fen?: string | null, whiteId: string | null, blackId: string | null }} MoveGame
 */

/**
 * True when `userId` plays white or black in `game`.
 * @param {{ whiteId?: string | null, blackId?: string | null }} game
 * @param {string | null | undefined} userId
 * @returns {boolean}
 */
function isParticipant(game, userId) {
    return Boolean(userId) && (userId === game.whiteId || userId === game.blackId);
}

/**
 * Side to move ('w' | 'b'), read from the position: the FEN is the authority,
 * not the separately stored clock side.
 * @param {{ fen?: string | null }} game
 * @returns {string}
 */
function sideToMove(game) {
    return activeSideFromFen(game.fen);
}

/**
 * The checks a move must pass before its legality is even looked at, in order.
 * Each entry is [fails(game, userId), reason]; a new rule is a new entry.
 * @type {ReadonlyArray<[(game: MoveGame, userId: string | null | undefined) => boolean, string]>}
 */
const CHECKS = [
    [(game) => game.status !== 'active', REJECTION.GAME_NOT_ACTIVE],
    [(game, userId) => !isParticipant(game, userId), REJECTION.NOT_A_PLAYER],
    [(game, userId) => playerIdOf(sideToColor(sideToMove(game)), game) !== userId, REJECTION.NOT_YOUR_TURN],
];

/**
 * Why `userId` may not move in `game` right now; null when they may.
 * @param {MoveGame | null | undefined} game
 * @param {string | null | undefined} userId
 * @returns {string | null}
 */
function moveRejection(game, userId) {
    if (!game) return REJECTION.GAME_NOT_FOUND;
    const failed = CHECKS.find(([fails]) => fails(game, userId));
    return failed ? failed[1] : null;
}

module.exports = { REJECTION, isParticipant, sideToMove, moveRejection };
