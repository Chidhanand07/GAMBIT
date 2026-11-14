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
    TIME_EXPIRED: 'time_expired',
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
 * @typedef {[(game: MoveGame, userId: string | null | undefined) => boolean, string]} Check
 *   [fails(game, userId), reason]
 */

/**
 * What any game action by a player needs: an active game the caller plays in.
 * @type {ReadonlyArray<Check>}
 */
const PLAYER_CHECKS = [
    [(game) => game.status !== 'active', REJECTION.GAME_NOT_ACTIVE],
    [(game, userId) => !isParticipant(game, userId), REJECTION.NOT_A_PLAYER],
];

/**
 * The checks a move must pass before its legality is even looked at, in order.
 * A new rule is a new entry.
 * @type {ReadonlyArray<Check>}
 */
const MOVE_CHECKS = [
    ...PLAYER_CHECKS,
    [(game, userId) => playerIdOf(sideToColor(sideToMove(game)), game) !== userId, REJECTION.NOT_YOUR_TURN],
];

/**
 * @param {ReadonlyArray<Check>} checks
 * @param {MoveGame | null | undefined} game
 * @param {string | null | undefined} userId
 * @returns {string | null}
 */
function firstRejection(checks, game, userId) {
    if (!game) return REJECTION.GAME_NOT_FOUND;
    const failed = checks.find(([fails]) => fails(game, userId));
    return failed ? failed[1] : null;
}

/**
 * Why `userId` may not move in `game` right now; null when they may.
 * @param {MoveGame | null | undefined} game
 * @param {string | null | undefined} userId
 * @returns {string | null}
 */
const moveRejection = (game, userId) => firstRejection(MOVE_CHECKS, game, userId);

/**
 * Why `userId` may not act as a player in `game` at all (resign, for example,
 * is allowed on either side's turn); null when they may.
 * @param {MoveGame | null | undefined} game
 * @param {string | null | undefined} userId
 * @returns {string | null}
 */
const playerRejection = (game, userId) => firstRejection(PLAYER_CHECKS, game, userId);

module.exports = { REJECTION, isParticipant, sideToMove, moveRejection, playerRejection };
