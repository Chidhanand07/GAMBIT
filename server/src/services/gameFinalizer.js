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
const { resultLabel, winnerIdFor } = require('../domain/result');
const { gameRoom } = require('./emitter');

const DEFAULT_TIME_CONTROL = '10';

/**
 * @typedef {import('../domain/adjudication').Verdict} Verdict
 * @typedef {'white' | 'black' | 'draw'} Outcome
 */

/**
 * @typedef {object} FinalizerDeps
 * @property {{ mutateGame: Function, removeActiveGame: Function }} gameStore
 * @property {{ finishIfActive: Function }} gamesRepo
 * @property {{ processGameEnd: Function }} ratingService
 * @property {{ triggerGameReview: (gameId: string, moveLog: any, timeControl: unknown) => void }} reviewService
 * @property {{ clearGame: (gameId: string) => void }} sessions
 * @property {import('./emitter').Emitter} emitter
 */

/**
 * The `games` row of a finished game. `result` is the outcome
 * ('white' | 'black' | 'draw'); see docs/fixes/DECISIONS.md F-008.
 * @param {any} game state after the transition
 * @param {Outcome} outcome
 */
function finishedRow(game, outcome) {
    return {
        status: 'completed',
        result: outcome,
        winner_id: winnerIdFor(outcome, game),
        ended_at: new Date().toISOString(),
        final_fen: game.fen ?? null,
        white_clock_ms: Math.round(game.whiteClockMs ?? 0),
        black_clock_ms: Math.round(game.blackClockMs ?? 0),
    };
}

/**
 * @param {FinalizerDeps} deps
 */
function createGameFinalizer({ gameStore, gamesRepo, ratingService, reviewService, sessions, emitter }) {
    /**
     * Persist the result; if this call won the database transition, start the
     * review and update ratings (time control and rated flag from server state).
     * @param {string} gameId
     * @param {any} game
     * @param {Outcome} outcome
     */
    async function persist(gameId, game, outcome) {
        const { data: updated } = await gamesRepo.finishIfActive(gameId, finishedRow(game, outcome));
        if (!updated) return;

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
     * @returns {Promise<boolean>} true when this call ended the game
     */
    async function endGameIf(gameId, decide) {
        /** @type {Outcome} */
        let outcome = 'draw';
        let reason = '';
        const finished = await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
            if (!game || game.status !== 'active' || !game.whiteId || !game.blackId) return null;
            const verdict = decide(game);
            if (!verdict) return null;
            outcome = verdict.winner ?? 'draw';
            reason = verdict.reason;
            return { ...game, status: 'completed', result: outcome, reason };
        });
        if (!finished) return false;

        await gameStore.removeActiveGame(gameId);
        emitter.toRoom(gameRoom(gameId), 'game_end', {
            game_id: gameId,
            result: resultLabel(outcome),
            reason,
            white_id: finished.whiteId,
            black_id: finished.blackId,
        });
        sessions.clearGame(gameId);
        await persist(gameId, finished, outcome);
        return true;
    }

    return {
        endGameIf,
        /**
         * End an active game with a verdict the caller already holds.
         * @param {string} gameId
         * @param {Verdict} verdict `winner` null is a draw
         * @returns {Promise<boolean>} true when this call ended the game; false
         *   when it was not active (unknown, already over, or missing a player)
         */
        endGame: (gameId, verdict) => endGameIf(gameId, () => verdict),
    };
}

module.exports = { createGameFinalizer };
