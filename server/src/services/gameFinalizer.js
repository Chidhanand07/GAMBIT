// @ts-check
/**
 * The single finalizer: every way a game ends goes through here: a move, a
 * resignation, a flag fall, an abandonment (NODE-16, NODE-18, G3). The verdict
 * is always computed by the server; no client payload reaches this module.
 *
 * Exactly once: the Redis state is moved active → completed in one atomic
 * transition, so of any number of concurrent callers only one proceeds to
 * broadcast. The database update is guarded the same way (`status = 'active'`),
 * so the rating and the review run once even if the clock path got there first.
 */
const { clocksAt } = require('../domain/clock');
const { resultLabel, winnerIdFor } = require('../domain/result');
const { gameRoom } = require('./emitter');
const { log } = require('../observability/log');

const DEFAULT_TIME_CONTROL = '10';
/** How often the finished row is written before giving up, and the pauses in between. */
const PERSIST_ATTEMPTS = 3;
const PERSIST_BACKOFF_MS = Object.freeze([200, 800]);

/**
 * @typedef {import('../domain/adjudication').Verdict} Verdict
 * @typedef {'white' | 'black' | 'draw' | 'aborted'} Outcome
 */

/**
 * @typedef {object} FinalizerDeps
 * @property {{ mutateGame: Function, removeActiveGame: Function }} gameStore
 * @property {{ finishIfActive: Function }} gamesRepo
 * @property {{ processGameEnd: Function }} ratingService
 * @property {{ triggerGameReview: (gameId: string, moveLog: any, timeControl: unknown) => void }} reviewService
 * @property {{ clearGame: (gameId: string) => void }} sessions
 * @property {import('./emitter').Emitter} emitter
 * @property {() => number} [now]
 * @property {(ms: number) => Promise<unknown>} [sleep] waits between database retries (injected in tests)
 */

/**
 * The `games` row of a finished game. `result` is the outcome
 * ('white' | 'black' | 'draw'); see docs/fixes/DECISIONS.md F-008. An aborted
 * game has `status = 'aborted'` and no result.
 * @param {any} game state after the transition
 * @param {Outcome} outcome
 */
function finishedRow(game, outcome) {
    const aborted = outcome === 'aborted';
    return {
        status: aborted ? 'aborted' : 'completed',
        result: aborted ? null : outcome,
        winner_id: winnerIdFor(outcome, game),
        ended_at: new Date().toISOString(),
        final_fen: game.fen ?? null,
        white_clock_ms: Math.round(game.whiteClockMs ?? 0),
        black_clock_ms: Math.round(game.blackClockMs ?? 0),
    };
}

/**
 * Write the finished row, retrying a failed write a bounded number of
 * times with growing pauses. A result that still cannot be written is
 * logged with the game id; the game stays finished for the players (Redis
 * is committed) but is not rated, because the rating must not run without
 * the row that makes it idempotent.
 * @param {{ gamesRepo: { finishIfActive: Function }, sleep: (ms: number) => Promise<unknown> }} deps
 * @param {string} gameId
 * @param {object} row
 * @returns {Promise<unknown>} the updated row when this call won the transition; null when the
 *   game was already finalized or could not be persisted
 */
async function writeResult({ gamesRepo, sleep }, gameId, row) {
    let lastError = '';
    for (let attempt = 0; attempt < PERSIST_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(PERSIST_BACKOFF_MS[attempt - 1]);
        try {
            const { data, error } = await gamesRepo.finishIfActive(gameId, row);
            if (!error) return data;
            lastError = error.message;
        } catch (e) {
            lastError = /** @type {Error} */ (e).message;
        }
    }
    log.error(`[finalizer] game ${gameId}: result not persisted after ${PERSIST_ATTEMPTS} attempts:`, lastError);
    return null;
}

/**
 * The state after `decide` ends `game`, or null when it does not (or the game
 * is not an active game with both players). The clocks are the clocks as they
 * stood at `at`: the side to move is charged for the time used since its last
 * move (G11).
 * @param {any} game state read inside the per-game lock
 * @param {(game: any) => Verdict | null} decide
 * @param {number} at
 * @returns {any | null}
 */
function finishedState(game, decide, at) {
    if (!game || game.status !== 'active' || !game.whiteId || !game.blackId) return null;
    const verdict = decide(game);
    if (!verdict) return null;
    /** @type {Outcome} */
    const outcome = verdict.aborted ? 'aborted' : (verdict.winner ?? 'draw');
    const { whiteMs, blackMs } = clocksAt(game, at);
    return {
        ...game,
        whiteClockMs: whiteMs,
        blackClockMs: blackMs,
        status: 'completed',
        result: outcome,
        reason: verdict.reason,
    };
}

/**
 * @param {FinalizerDeps} deps
 */
function createGameFinalizer({
    gameStore,
    gamesRepo,
    ratingService,
    reviewService,
    sessions,
    emitter,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
    /**
     * Persist the result; if this call won the database transition, start the
     * review and update ratings (time control and rated flag from server state).
     * @param {string} gameId
     * @param {any} game
     * @param {Outcome} outcome
     */
    async function persist(gameId, game, outcome) {
        const updated = await writeResult({ gamesRepo, sleep }, gameId, finishedRow(game, outcome));
        // An aborted game was never played: nothing to review, nothing to rate.
        if (!updated || outcome === 'aborted') return;

        const timeControl = game.timeControl ?? DEFAULT_TIME_CONTROL;
        // Full Game Review in the engine (depth-18 Stockfish per move); fire-and-forget.
        reviewService.triggerGameReview(gameId, game.moveLog, timeControl);

        const { whiteId, blackId } = game;
        const isRated = game.isRated ?? false;
        const changes = await ratingService.processGameEnd(gameId, whiteId, blackId, outcome, timeControl, isRated);
        if (changes) emitter.toRoom(gameRoom(gameId), 'rating_updated', changes);
    }

    /**
     * End the game if `decide` says so. `decide` runs on the state read inside
     * the per-game lock, in the same atomic active → completed transition, so a
     * verdict is never taken on stale state (the clock relies on this: a move
     * or a reconnect that lands first wins).
     * @param {string} gameId
     * @param {(game: any) => Verdict | null} decide only called for an active game with both players
     * @param {number} [at] the instant the verdict refers to (a move's time, a tick's time); default: now
     * @returns {Promise<boolean>} true when this call ended the game
     */
    async function endGameIf(gameId, decide, at = now()) {
        const finished = await gameStore.mutateGame(gameId, (/** @type {any} */ game) =>
            finishedState(game, decide, at),
        );
        if (!finished) return false;
        const outcome = /** @type {Outcome} */ (finished.result);
        const { reason } = finished;

        // From here on the game IS over (the state is committed). Tell the players first;
        // leaving the ticker's set is housekeeping (the ticker ignores finished games).
        emitter.toRoom(gameRoom(gameId), 'game_end', {
            game_id: gameId,
            result: resultLabel(outcome),
            reason,
            white_id: finished.whiteId,
            black_id: finished.blackId,
        });
        sessions.clearGame(gameId);
        try {
            await gameStore.removeActiveGame(gameId);
        } catch (e) {
            log.error(`[finalizer] game ${gameId}: could not leave the active set:`, /** @type {Error} */ (e).message);
        }
        await persist(gameId, finished, outcome);
        return true;
    }

    return {
        endGameIf,
        /**
         * End an active game with a verdict the caller already holds.
         * @param {string} gameId
         * @param {Verdict} verdict `winner` null is a draw
         * @param {number} [at] the instant the game ended; default: now
         * @returns {Promise<boolean>} true when this call ended the game; false
         *   when it was not active (unknown, already over, or missing a player)
         */
        endGame: (gameId, verdict, at) => endGameIf(gameId, () => verdict, at),
    };
}

module.exports = { createGameFinalizer };
