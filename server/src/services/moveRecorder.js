// @ts-check
/**
 * `make_move` once the caller is known: authorize, check legality against the
 * server's own position, store the new state, broadcast and persist.
 *
 * The server is the authority (NODE-11, NODE-16, SEC-09). The position comes
 * from Redis, legality from chess.js (domain/chessRules), and the UCI, SAN and
 * FEN that are stored, broadcast and persisted are the ones computed here.
 * The read–decide–write runs under the per-game lock, so the same move sent
 * twice is applied once.
 */
const { activeRemainingMs, clocksAfterMove } = require('../domain/clock');
const { playMove } = require('../domain/chessRules');
const { clearedRequests } = require('../domain/pendingRequests');
const { moveRejection, sideToMove, REJECTION } = require('../domain/moveAuthorization');
const { sideToColor } = require('../domain/result');
const { isDailyTimeControl } = require('../domain/preferences');
const { gameRoom } = require('./emitter');
const { log } = require('../observability/log');

/**
 * @typedef {import('../domain/chessRules').PlayedMove} PlayedMove
 * @typedef {{ game_id: string, from: string, to: string, promotion?: string }} MoveRequest
 * @typedef {{ accepted: true, state: any, played: PlayedMove } |
 *   { accepted: false, reason: string, game: any }} MoveOutcome
 */

/**
 * State after `played`: the mover's clock is charged (plus increment), the
 * move is appended to the log as UCI + SAN + FEN, the side to move flips, and
 * any standing request between the players (a draw offer) lapses.
 * @param {any} game
 * @param {PlayedMove} played
 * @param {number} at
 */
function stateAfterMove(game, played, at) {
    const movedSide = sideToMove(game);
    const clocks = clocksAfterMove({ ...game, activeSide: movedSide }, at);
    return {
        ...game,
        ...clearedRequests(game),
        fen: played.fen,
        whiteClockMs: clocks.whiteMs,
        blackClockMs: clocks.blackMs,
        activeSide: clocks.nextSide,
        lastMoveAt: at,
        moveLog: [...(game.moveLog || []), { move: played.uci, fen: played.fen, san: played.san }],
        ...clockLogAfter(game, clocks),
    };
}

/**
 * The per-ply clock snapshots a takeback restores (ADR F-152), extended by this move. Kept only
 * while it is in step with the move log: a game restored from the database has a move log
 * without snapshots, and starts none.
 * @param {any} game state before the move
 * @param {{ whiteMs: number, blackMs: number }} clocks both clocks right after the move
 * @returns {{ clockLog?: Array<{ whiteMs: number, blackMs: number }> }}
 */
function clockLogAfter(game, clocks) {
    const log = Array.isArray(game.clockLog) ? game.clockLog : [];
    if (log.length !== (game.moveLog?.length ?? 0)) return {};
    return { clockLog: [...log, { whiteMs: clocks.whiteMs, blackMs: clocks.blackMs }] };
}

/**
 * True when the mover's time ran out before this move arrived. The ticker
 * only looks once a second, so without this check a move sent in that gap
 * was accepted with a clock of 0 plus the increment (G7).
 * @param {any} game
 * @param {number} at
 * @returns {boolean}
 */
function isFlagDown(game, at) {
    return Boolean(game.lastMoveAt) && activeRemainingMs({ ...game, activeSide: sideToMove(game) }, at) <= 0;
}

/**
 * The `move_made` broadcast: server values only, under the field names the
 * frontend already reads.
 * @param {MoveRequest} request
 * @param {PlayedMove} played
 * @param {{ whiteClockMs: number, blackClockMs: number }} state
 */
function moveMadePayload(request, played, state) {
    const promoted = played.uci.length > request.from.length + request.to.length;
    return {
        game_id: request.game_id,
        from: request.from,
        to: request.to,
        ...(promoted ? { promotion: played.uci.slice(-1) } : {}),
        move: played.uci,
        san: played.san,
        fen: played.fen,
        captured: played.captured,
        flags: played.flags,
        whiteMs: state.whiteClockMs,
        blackMs: state.blackClockMs,
    };
}

/**
 * "Your turn (daily games)" (ADR F-140): after a move in a daily game, a bell notification for
 * the player to move, if their switch is on. Fire-and-forget; the preferences port never throws.
 * @param {import('./gameService').PreferencesPort | undefined} preferences
 * @param {string} gameId
 * @param {any} state state after the move
 */
function remindPlayerToMove(preferences, gameId, state) {
    if (!preferences || !isDailyTimeControl(state.timeControl)) return;
    const userId = state.activeSide === 'w' ? state.whiteId : state.blackId;
    if (!userId) return;
    void preferences.notify({
        userId,
        column: 'notify_your_turn',
        type: 'your_turn',
        payload: { message: 'Your move', game_id: gameId, time_control: state.timeControl },
    });
}

/**
 * @param {Pick<import('./gameService').GameServiceDeps, 'gameStore' | 'gamesRepo' | 'movesRepo' | 'emitter' | 'now' | 'preferences'>} deps
 */
function createMoveRecorder({ gameStore, gamesRepo, movesRepo, emitter, preferences, now = () => Date.now() }) {
    /**
     * Fire-and-forget: update the games row (position and both clocks, in the
     * canonical clock columns, so the row alone can restore the game: G2) and
     * append the move row.
     * @param {string} gameId
     * @param {any} state state after the move
     * @param {PlayedMove} played
     */
    function persist(gameId, state, played) {
        const movedColor = sideToColor(state.activeSide === 'w' ? 'b' : 'w');
        const clockMs = movedColor === 'white' ? state.whiteClockMs : state.blackClockMs;
        Promise.all([
            gamesRepo.updateById(gameId, {
                fen: played.fen,
                white_clock_ms: Math.round(state.whiteClockMs),
                black_clock_ms: Math.round(state.blackClockMs),
            }),
            movesRepo.insert({
                game_id: gameId,
                move_number: state.moveLog.length,
                color: movedColor,
                uci: played.uci,
                san: played.san,
                fen_after: played.fen,
                clock_ms_remaining: Math.round(clockMs),
            }),
        ])
            .then(([gRes, mRes]) => {
                if (gRes?.error) log.error('[make_move] game persist:', gRes.error.message);
                if (mRes?.error) log.error('[make_move] move persist:', mRes.error.message);
            })
            .catch((e) => log.error('[make_move] persist failed:', /** @type {Error} */ (e).message));
    }

    /**
     * Apply `request` for `userId` if it is their legal move; otherwise say why not.
     * @param {MoveRequest} request
     * @param {string} userId the connection's verified user
     * @returns {Promise<MoveOutcome>}
     */
    async function submit(request, userId) {
        /** @type {MoveOutcome | null} */
        let outcome = null;
        await gameStore.mutateGame(request.game_id, (/** @type {any} */ game) => {
            const at = now();
            const reason = moveRejection(game, userId) ?? (isFlagDown(game, at) ? REJECTION.TIME_EXPIRED : null);
            if (reason) {
                outcome = { accepted: false, reason, game };
                return null;
            }
            const played = playMove(game, request);
            if (!played.legal) {
                outcome = { accepted: false, reason: REJECTION.ILLEGAL_MOVE, game };
                return null;
            }
            const state = stateAfterMove(game, played, at);
            outcome = { accepted: true, state, played };
            return state;
        });
        const result = /** @type {MoveOutcome} */ (/** @type {unknown} */ (outcome));
        if (result.accepted) {
            emitter.toRoom(
                gameRoom(request.game_id),
                'move_made',
                moveMadePayload(request, result.played, result.state),
            );
            persist(request.game_id, result.state, result.played);
            remindPlayerToMove(preferences, request.game_id, result.state);
        }
        return result;
    }

    return { submit };
}

module.exports = { createMoveRecorder };
