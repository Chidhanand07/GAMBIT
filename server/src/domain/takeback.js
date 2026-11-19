// @ts-check
/**
 * Takebacks (ADR F-152). Pure: decided from the stored game state, the caller's
 * colour and the time.
 *
 * What is undone: a player asks to undo their own last move. If the opponent has
 * not replied yet (it is the opponent's turn) that is one ply; if the opponent has
 * replied (it is the requester's turn again) it is two plies, the reply and the
 * requester's move, so the requester is to move again in the restored position.
 *
 * State, inside the Redis game JSON:
 * - `takeback: { by, plies, ply, at } | null`: the one standing request (`ply`: moves played then);
 * - `lastTakebackAt: { white?, black? }`: when each side last asked (the cooldown);
 * - `clockLog: [{ whiteMs, blackMs }]`: both clocks right after each ply, kept in step with
 *   `moveLog`, so a takeback restores the clocks of the position it returns to.
 */
const { activeSideFromFen } = require('./gameState');
const { clearedRequests, ALL_REQUEST_KEYS } = require('./pendingRequests');
const { clocksAt } = require('./clock');
const { initialClockMs } = require('./timeControl');
const { sideToColor } = require('./result');

/** Ack codes of the takeback events. */
const TAKEBACK_REJECTION = Object.freeze({
    PENDING: 'takeback_pending',
    DISABLED: 'takebacks_disabled',
    COOLDOWN: 'takeback_cooldown',
    NOTHING_TO_UNDO: 'takeback_nothing_to_undo',
    NO_PENDING_REQUEST: 'no_pending_request',
});

/** A side may ask again only this long after its last request, whatever the answer was. */
const TAKEBACK_COOLDOWN_MS = 15000;

/**
 * @typedef {'white' | 'black'} Color
 * @typedef {{ by: Color, plies: number, ply: number, at: number }} TakebackRequest
 */

/** @param {any} game */
const pliesOf = (game) => game.moveLog?.length ?? 0;

/**
 * How many plies a takeback by `color` undoes now: 1 when `color` moved last, 2 when the
 * opponent has replied. May exceed the moves played (then there is nothing to undo).
 * @param {any} game
 * @param {Color} color
 * @returns {number}
 */
function pliesToUndo(game, color) {
    return sideToColor(activeSideFromFen(game.fen)) === color ? 2 : 1;
}

/**
 * Why `color` may not ask for a takeback now; null when it may.
 * @param {any} game an active game the caller plays in
 * @param {Color} color
 * @param {number} at
 * @param {boolean} opponentAllows the opponent's stored "Allow takeback requests" (ADR F-166)
 * @returns {string | null}
 */
function takebackRejection(game, color, at, opponentAllows) {
    if (game.takeback) return TAKEBACK_REJECTION.PENDING;
    if (!opponentAllows) return TAKEBACK_REJECTION.DISABLED;
    const last = game.lastTakebackAt?.[color];
    if (typeof last === 'number' && at - last < TAKEBACK_COOLDOWN_MS) return TAKEBACK_REJECTION.COOLDOWN;
    if (pliesToUndo(game, color) > pliesOf(game)) return TAKEBACK_REJECTION.NOTHING_TO_UNDO;
    return null;
}

/**
 * Fields to store for a new request by `color` at `at`.
 * @param {any} game
 * @param {Color} color
 * @param {number} at
 */
function withTakebackRequest(game, color, at) {
    return {
        takeback: { by: color, plies: pliesToUndo(game, color), ply: pliesOf(game), at },
        lastTakebackAt: { ...(game.lastTakebackAt ?? {}), [color]: at },
    };
}

/**
 * True when a request by the opponent of `color` stands for the current position.
 * @param {any} game
 * @param {Color} color
 * @returns {boolean}
 */
function hasTakebackFor(game, color) {
    const request = game.takeback;
    return Boolean(request) && request.by !== color && request.ply === pliesOf(game);
}

/**
 * Both clocks of the position after `keep` plies: the snapshot stored with that ply, the
 * starting time for the start position, or (for a log without snapshots, e.g. a game restored
 * from the database) the clocks as they stand now.
 * @param {any} game
 * @param {number} keep
 * @param {number} at
 * @returns {{ whiteMs: number, blackMs: number }}
 */
function clocksAfterPly(game, keep, at) {
    if (keep === 0) {
        const start = initialClockMs(game.timeControl);
        return { whiteMs: start, blackMs: start };
    }
    const log = Array.isArray(game.clockLog) && game.clockLog.length === pliesOf(game) ? game.clockLog : null;
    return log ? log[keep - 1] : clocksAt(game, at);
}

/**
 * The state after the standing request is granted at `at`: position, move log and clocks of
 * the earlier ply, the side to move from that position, and the clock running from `at` (or
 * not started, back at the start position, where the first-move window opens again).
 * @param {any} game
 * @param {number} at
 */
function rolledBack(game, at) {
    const keep = pliesOf(game) - game.takeback.plies;
    const moveLog = game.moveLog.slice(0, keep);
    const fen = keep > 0 ? moveLog[keep - 1].fen : game.startFen;
    const clocks = clocksAfterPly(game, keep, at);
    return {
        ...game,
        ...clearedRequests(game, ALL_REQUEST_KEYS),
        fen,
        moveLog,
        ...(Array.isArray(game.clockLog) ? { clockLog: game.clockLog.slice(0, keep) } : {}),
        whiteClockMs: clocks.whiteMs,
        blackClockMs: clocks.blackMs,
        activeSide: activeSideFromFen(fen),
        lastMoveAt: keep > 0 ? at : null,
        ...(keep === 0 ? { startedAt: at } : {}),
        takeback: null,
    };
}

module.exports = {
    TAKEBACK_REJECTION,
    TAKEBACK_COOLDOWN_MS,
    pliesToUndo,
    takebackRejection,
    withTakebackRequest,
    hasTakebackFor,
    rolledBack,
};
