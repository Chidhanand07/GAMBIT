// @ts-check
/**
 * Premoves (ADR F-153). Pure: decided from the stored game state.
 *
 * A player may queue one move while it is the opponent's turn: `premove: { by, from, to,
 * promotion? }` in the Redis game state. Right after the opponent's move is applied, in the
 * same compare-and-set, the premove is tried as a normal move at the same instant: legal →
 * played (the owner's clock is charged zero time and gets its increment); illegal → dropped,
 * and its owner is told. A move that ends the game drops it silently.
 */
const { playMove, positionOf } = require('./chessRules');
const { sideToMove } = require('./moveAuthorization');
const { stateAfterMove } = require('./moveState');
const { playerIdOf, sideToColor } = require('./result');

/** Ack codes of `premove_set`. */
const PREMOVE_REJECTION = Object.freeze({
    /** It is the caller's turn: they should simply move. */
    YOUR_TURN: 'premove_your_turn',
    /** There is no piece of the caller's on the from-square. */
    NOT_YOUR_PIECE: 'illegal_premove',
});

/**
 * @typedef {'white' | 'black'} Color
 * @typedef {{ by: Color, from: string, to: string, promotion?: string }} Premove
 * @typedef {import('./chessRules').PlayedMove} PlayedMove
 */

/**
 * Why `color` may not queue `request` now; null when it may.
 * @param {any} game an active game the caller plays in
 * @param {Color} color
 * @param {{ from: string }} request
 * @returns {string | null}
 */
function premoveRejection(game, color, { from }) {
    if (sideToColor(sideToMove(game)) === color) return PREMOVE_REJECTION.YOUR_TURN;
    const piece = positionOf(game).get(/** @type {import('chess.js').Square} */ (from));
    return piece && sideToColor(piece.color) === color ? null : PREMOVE_REJECTION.NOT_YOUR_PIECE;
}

/**
 * The stored premove for `color` (a later one replaces an earlier one).
 * @param {Color} color
 * @param {{ from: string, to: string, promotion?: string }} request
 * @returns {{ premove: Premove }}
 */
function withPremove(color, { from, to, promotion }) {
    return { premove: { by: color, from, to, ...(promotion ? { promotion } : {}) } };
}

/**
 * The owner's own premove for `game_state_sync`; nobody else ever sees it.
 * @param {any} game
 * @param {string | undefined} viewerId
 */
function premoveView(game, viewerId) {
    const premove = game.premove;
    if (!premove || !viewerId || playerIdOf(premove.by, game) !== viewerId) return {};
    const { from, to, promotion } = premove;
    return { premove: { from, to, ...(promotion ? { promotion } : {}) } };
}

/**
 * @typedef {object} Resolution
 * @property {any} first the state after the opponent's move, without the premove
 * @property {any} final the state to store: `first`, or the state after the premove
 * @property {{ premove: Premove, played: PlayedMove } | null} applied
 * @property {Premove | null} discarded the premove that turned out illegal
 */

/**
 * Try the premove queued in `state` (the state right after the opponent's move at `at`).
 * @param {any} state
 * @param {number} at
 * @param {boolean} gameOver the opponent's move ended the game: the premove lapses
 * @returns {Resolution}
 */
function resolvePremove(state, at, gameOver) {
    /** @type {Premove | null} */
    const premove = state.premove ?? null;
    const first = premove ? { ...state, premove: null } : state;
    const none = { first, final: first, applied: null, discarded: null };
    if (!premove || gameOver) return none;
    const owner = sideToColor(sideToMove(first));
    const played = owner === premove.by ? playMove(first, premove) : { legal: false };
    if (!played.legal) return { ...none, discarded: premove };
    const move = /** @type {PlayedMove} */ (played);
    return { first, final: stateAfterMove(first, move, at), applied: { premove, played: move }, discarded: null };
}

module.exports = { PREMOVE_REJECTION, premoveRejection, withPremove, premoveView, resolvePremove };
