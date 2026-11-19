// @ts-check
/**
 * Takebacks: `takeback_request`, `takeback_accept`, `takeback_decline` (ADR F-152). Whether
 * the opponent allows a request is their stored preference, read on the server (ADR F-166). The handlers pass the validated payload and the verified user id.
 *
 * Every change goes through `mutateGame`'s compare-and-set, so it is correct across
 * replicas: an accept re-checks that the request still stands for the current position
 * in the same transition that rolls the position back, so a move that lands first (and
 * clears the request) or an ending that commits first wins. The `moves` rows of the
 * undone plies are deleted afterwards, like moves are persisted: after Redis commits.
 */
const { clocksAt, isClockRunning } = require('../domain/clock');
const { playerRejection, REJECTION } = require('../domain/moveAuthorization');
const { colorOfPlayer } = require('../domain/result');
const {
    hasTakebackFor,
    rolledBack,
    takebackRejection,
    withTakebackRequest,
    TAKEBACK_REJECTION,
} = require('../domain/takeback');
const { gameRoom } = require('./emitter');
const { opponentAllowsTakebacks } = require('./gameplayPreferences');
const { log } = require('../observability/log');

/**
 * @typedef {{ ok: boolean, error?: string }} AckResult
 * @typedef {'white' | 'black'} Color
 * @typedef {object} TakebackDeps
 * @property {{ mutateGame: Function }} gameStore
 * @property {{ updateById: Function }} gamesRepo
 * @property {{ deleteAfter: Function }} movesRepo
 * @property {import('./emitter').Emitter} emitter
 * @property {() => number} now
 * @property {Partial<import('./gameplayPreferences').GameplayPort>} [preferences] stored gameplay switches
 */

/**
 * Run `decide` on the game inside one compare-and-set, as the verified player `userId`.
 * `decide` returns the next state, or a rejection code to leave the state untouched.
 * @param {{ mutateGame: Function }} gameStore
 * @param {string} gameId
 * @param {string} userId
 * @param {(game: any, color: Color) => any | string} decide
 * @returns {Promise<{ state: any, color: Color } | { error: string }>}
 */
async function asPlayer(gameStore, gameId, userId, decide) {
    /** @type {string} */
    let error = REJECTION.GAME_NOT_FOUND;
    /** @type {Color} */
    let color = 'white';
    const state = await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
        const rejection = playerRejection(game, userId);
        if (rejection) {
            error = rejection;
            return null;
        }
        color = colorOfPlayer(userId, game.whiteId);
        const next = decide(game, color);
        if (typeof next !== 'string') return next;
        error = next;
        return null;
    });
    return state ? { state, color } : { error };
}

/**
 * The `takeback_applied` broadcast: the restored position, move log and clocks.
 * @param {string} gameId
 * @param {any} state
 * @param {number} plies
 * @param {number} at
 */
function appliedPayload(gameId, state, plies, at) {
    const { whiteMs, blackMs } = clocksAt(state, at);
    return {
        game_id: gameId,
        plies,
        fen: state.fen,
        moveLog: state.moveLog,
        whiteMs,
        blackMs,
        activeSide: state.activeSide,
        clockActive: isClockRunning(state),
    };
}

/**
 * @param {TakebackDeps} deps
 */
function createTakebacks({ gameStore, gamesRepo, movesRepo, emitter, now, preferences }) {
    /**
     * Fire-and-forget, after Redis committed: drop the undone `moves` rows and store the
     * restored position and clocks in the `games` row (so a restore from the row matches).
     * @param {string} gameId
     * @param {any} state
     */
    function persist(gameId, state) {
        Promise.all([
            movesRepo.deleteAfter(gameId, state.moveLog.length),
            gamesRepo.updateById(gameId, {
                fen: state.fen,
                white_clock_ms: Math.round(state.whiteClockMs),
                black_clock_ms: Math.round(state.blackClockMs),
            }),
        ])
            .then((results) => {
                for (const res of results) if (res?.error) log.error('[takeback] persist:', res.error.message);
            })
            .catch((e) => log.error('[takeback] persist failed:', /** @type {Error} */ (e).message));
    }

    /**
     * `takeback_request`: ask the opponent to undo the caller's last move.
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function requestTakeback({ game_id: gameId }, userId) {
        const current = await gameStore.getGame(gameId);
        const color = current ? colorOfPlayer(userId, current.whiteId) : 'white';
        const allowed = current ? await opponentAllowsTakebacks(preferences, current, color) : false;
        const at = now();
        const out = await asPlayer(gameStore, gameId, userId, (game, side) => {
            const rejection = takebackRejection(game, side, at, allowed && side === color);
            return rejection ?? { ...game, ...withTakebackRequest(game, side, at) };
        });
        if ('error' in out) return { ok: false, error: out.error };
        const { by, plies } = out.state.takeback;
        emitter.toRoom(gameRoom(gameId), 'takeback_requested', { game_id: gameId, by, plies });
        return { ok: true };
    }

    /**
     * `takeback_accept`: grant the opponent's standing request; the position, move log and
     * clocks roll back and the room gets the restored state.
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function acceptTakeback({ game_id: gameId }, userId) {
        const at = now();
        let plies = 0;
        const out = await asPlayer(gameStore, gameId, userId, (game, color) => {
            if (!hasTakebackFor(game, color)) return TAKEBACK_REJECTION.NO_PENDING_REQUEST;
            plies = game.takeback.plies;
            return rolledBack(game, at);
        });
        if ('error' in out) return { ok: false, error: out.error };
        emitter.toRoom(gameRoom(gameId), 'takeback_applied', appliedPayload(gameId, out.state, plies, at));
        persist(gameId, out.state);
        return { ok: true };
    }

    /**
     * `takeback_decline`: clear the opponent's standing request and tell the room.
     * @param {{ game_id: string }} data
     * @param {string} userId
     * @returns {Promise<AckResult>}
     */
    async function declineTakeback({ game_id: gameId }, userId) {
        const out = await asPlayer(gameStore, gameId, userId, (game, color) =>
            hasTakebackFor(game, color) ? { ...game, takeback: null } : TAKEBACK_REJECTION.NO_PENDING_REQUEST,
        );
        if ('error' in out) return { ok: false, error: out.error };
        emitter.toRoom(gameRoom(gameId), 'takeback_declined', { game_id: gameId, by: out.color });
        return { ok: true };
    }

    return { requestTakeback, acceptTakeback, declineTakeback };
}

module.exports = { createTakebacks };
