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
 *
 * A row that still cannot be written after the retries goes to the result
 * outbox; a worker writes it later and then rates the game (ADR F-066).
 */
const { clocksAt } = require('../domain/clock');
const { resultLabel, winnerIdFor } = require('../domain/result');
const { gameRoom } = require('./emitter');
const { resultJob, applyResultEffects } = require('./gameResultEffects');
const { backoffMs, DEFAULT_REDRIVE_POLICY } = require('../domain/redrivePolicy');
const { log } = require('../observability/log');
const { reportError } = require('../observability/errorReporter');
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
 * @property {Pick<import('../repositories/gameResultOutboxRepository').ResultOutbox, 'enqueue'>} [resultOutbox]
 *   where a row that cannot be written goes (without it, the failure is only logged)
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
 * times with growing pauses.
 * @param {{ gamesRepo: { finishIfActive: Function }, sleep: (ms: number) => Promise<unknown> }} deps
 * @param {string} gameId
 * @param {object} row
 * @returns {Promise<{ written: true, updated: unknown } | { written: false, error: string }>} `updated`:
 *   the row when this call won the transition, null when the game was already finalized
 */
async function writeResult({ gamesRepo, sleep }, gameId, row) {
    let lastError = '';
    for (let attempt = 0; attempt < PERSIST_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(PERSIST_BACKOFF_MS[attempt - 1]);
        try {
            const { data, error } = await gamesRepo.finishIfActive(gameId, row);
            if (!error) return { written: true, updated: data };
            lastError = error.message;
        } catch (e) {
            lastError = /** @type {Error} */ (e).message;
        }
    }
    return { written: false, error: lastError };
}

/**
 * A result that could not be written: the game stays finished for the players (Redis is
 * committed) and is not rated now, because the rating must not run without the row that makes
 * it idempotent. It goes to the outbox, whose worker writes and rates it later (F-066). If even
 * that fails the result exists only in Redis: logged at fatal and reported (SEC-12).
 * @param {{ resultOutbox?: Pick<import('../repositories/gameResultOutboxRepository').ResultOutbox, 'enqueue'>,
 *   now: () => number }} deps
 * @param {import('./gameResultEffects').ResultJob} job
 * @param {object} row
 * @param {string} lastError
 */
async function queueForRedrive({ resultOutbox, now }, job, row, lastError) {
    const prefix = `[finalizer] game ${job.gameId}: result not persisted after ${PERSIST_ATTEMPTS} attempts`;
    if (!resultOutbox) {
        log.error(`${prefix}:`, lastError);
        return;
    }
    const at = now();
    const item = { ...job, row, attempts: 0, firstFailedAt: at, lastError };
    try {
        await resultOutbox.enqueue(item, at + backoffMs(0, DEFAULT_REDRIVE_POLICY));
        log.error(`${prefix}, queued for re-drive:`, lastError);
    } catch (e) {
        log.fatal(`${prefix} and could not be queued for re-drive:`, /** @type {Error} */ (e).message);
        await reportError(e, { level: 'fatal', where: 'finalizer', gameId: job.gameId });
    }
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
    resultOutbox,
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
        const row = finishedRow(game, outcome);
        const job = resultJob(gameId, game, outcome);
        const write = await writeResult({ gamesRepo, sleep }, gameId, row);
        if (!write.written) return queueForRedrive({ resultOutbox, now }, job, row, write.error);
        // Already finalized by someone else: they reviewed and rated it.
        if (!write.updated) return;
        await applyResultEffects({ ratingService, reviewService, emitter }, job, { review: true });
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
