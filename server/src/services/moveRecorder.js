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
const { adjudicate } = require('../domain/adjudication');
const { activeRemainingMs } = require('../domain/clock');
const { playMove } = require('../domain/chessRules');
const { moveRejection, sideToMove, REJECTION } = require('../domain/moveAuthorization');
const { stateAfterMove } = require('../domain/moveState');
const { resolvePremove } = require('../domain/premove');
const { playerIdOf, sideToColor } = require('../domain/result');
const { isDailyTimeControl } = require('../domain/preferences');
const { gameRoom, playerRoom } = require('./emitter');
const { log } = require('../observability/log');

/**
 * @typedef {import('../domain/chessRules').PlayedMove} PlayedMove
 * @typedef {{ game_id: string, from: string, to: string, promotion?: string }} MoveRequest
 * @typedef {import('../domain/adjudication').Verdict} Verdict
 * @typedef {import('../domain/premove').Resolution} Resolution
 * @typedef {{ accepted: true, state: any, played: PlayedMove, verdict: Verdict | null,
 *   premove: { played: PlayedMove, state: any, verdict: Verdict | null } | null } |
 *   { accepted: false, reason: string, game: any }} MoveOutcome
 *   `state`: after the requested move; `premove`: the queued reply played right after it (ADR F-153)
 */

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

/** `from` and `to` of a UCI move. */
const UCI_SQUARES = /^(?<from>[a-h][1-8])(?<to>[a-h][1-8])/;

/**
 * The accepted outcome: the requested move and, when the opponent's queued premove
 * followed it, that move too, each with the verdict on the position it left.
 * @param {PlayedMove} played
 * @param {Verdict | null} verdict
 * @param {Resolution} resolution
 * @returns {MoveOutcome}
 */
function acceptedOutcome(played, verdict, { first, final, applied }) {
    const premove = applied
        ? { played: applied.played, state: final, verdict: adjudicate(applied.played.position) }
        : null;
    return { accepted: true, state: first, played, verdict, premove };
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
 * @typedef {Pick<import('./gameService').GameServiceDeps, 'gamesRepo' | 'movesRepo'>} Repos
 * @typedef {{ premove: import('../domain/premove').Premove, game: any }} Discarded
 */

/**
 * Fire-and-forget: update the games row (position and both clocks, in the
 * canonical clock columns, so the row alone can restore the game: G2) and
 * append the move row. Never rejects.
 * @param {Repos} repos
 * @param {string} gameId
 * @param {any} state state after the move
 * @param {PlayedMove} played
 * @returns {Promise<void>}
 */
function persist({ gamesRepo, movesRepo }, gameId, state, played) {
    const movedColor = sideToColor(state.activeSide === 'w' ? 'b' : 'w');
    const clockMs = movedColor === 'white' ? state.whiteClockMs : state.blackClockMs;
    return Promise.all([
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
 * The decision on `request` for `userId` in `game` at `at`: refused, or the state to store
 * (after the move and, when the opponent queued one, after their premove).
 * @param {any} game
 * @param {MoveRequest} request
 * @param {string} userId
 * @param {number} at
 * @returns {{ outcome: MoveOutcome, next: any, discarded: Discarded | null }}
 */
function decide(game, request, userId, at) {
    const reason = moveRejection(game, userId) ?? (isFlagDown(game, at) ? REJECTION.TIME_EXPIRED : null);
    if (reason) return { outcome: { accepted: false, reason, game }, next: null, discarded: null };
    const played = playMove(game, request);
    if (!played.legal) {
        return { outcome: { accepted: false, reason: REJECTION.ILLEGAL_MOVE, game }, next: null, discarded: null };
    }
    const move = /** @type {PlayedMove} */ (played);
    const verdict = adjudicate(move.position);
    const resolution = resolvePremove(stateAfterMove(game, move, at), at, Boolean(verdict));
    const discarded = resolution.discarded ? { premove: resolution.discarded, game } : null;
    return { outcome: acceptedOutcome(move, verdict, resolution), next: resolution.final, discarded };
}

/**
 * Broadcast and persist the accepted move, then the premove played right after it.
 * The rows are written in that order, so the games row ends on the final position.
 * @param {Repos & { emitter: import('./emitter').Emitter }} deps
 * @param {MoveRequest} request
 * @param {Extract<MoveOutcome, { accepted: true }>} result
 */
function announce(deps, request, result) {
    const gameId = request.game_id;
    const room = gameRoom(gameId);
    deps.emitter.toRoom(room, 'move_made', moveMadePayload(request, result.played, result.state));
    const premove = result.premove;
    if (premove) {
        const { from, to } = premove.played.uci.match(UCI_SQUARES)?.groups ?? { from: '', to: '' };
        const payload = moveMadePayload({ game_id: gameId, from, to }, premove.played, premove.state);
        deps.emitter.toRoom(room, 'move_made', payload);
    }
    void persist(deps, gameId, result.state, result.played).then(() =>
        premove ? persist(deps, gameId, premove.state, premove.played) : undefined,
    );
}

/**
 * The queued premove was not legal after the opponent's move: only its owner is told.
 * @param {import('./emitter').Emitter} emitter
 * @param {string} gameId
 * @param {Discarded} discarded
 */
function tellDiscarded(emitter, gameId, { premove, game }) {
    const ownerId = playerIdOf(premove.by, game);
    if (!ownerId) return;
    emitter.toRoom(playerRoom(gameId, ownerId), 'premove_discarded', { game_id: gameId, reason: 'illegal_move' });
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
     * Apply `request` for `userId` if it is their legal move; otherwise say why not.
     * @param {MoveRequest} request
     * @param {string} userId the connection's verified user
     * @returns {Promise<MoveOutcome>}
     */
    async function submit(request, userId) {
        /** @type {ReturnType<typeof decide> | null} */
        let decision = null;
        await gameStore.mutateGame(request.game_id, (/** @type {any} */ game) => {
            decision = decide(game, request, userId, now());
            return decision.next;
        });
        const { outcome, discarded } = /** @type {ReturnType<typeof decide>} */ (/** @type {unknown} */ (decision));
        if (outcome.accepted) {
            announce({ gamesRepo, movesRepo, emitter }, request, outcome);
            // After a premove the player to move is the one who just moved again.
            remindPlayerToMove(preferences, request.game_id, outcome.premove?.state ?? outcome.state);
        }
        if (discarded) tellDiscarded(emitter, request.game_id, discarded);
        return outcome;
    }

    return { submit };
}

module.exports = { createMoveRecorder };
