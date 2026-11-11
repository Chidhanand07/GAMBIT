// @ts-check
/**
 * The single finalizer for games that end by a move or a resignation
 * (NODE-16, NODE-18). `endGame` is only ever called by the server with a
 * verdict it computed itself; no client payload reaches this module.
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

    return {
        /**
         * End an active game with a server-computed verdict.
         * @param {string} gameId
         * @param {Verdict} verdict `winner` null is a draw
         * @returns {Promise<boolean>} true when this call ended the game; false
         *   when it was not active (unknown, already over, or missing a player)
         */
        async endGame(gameId, { winner, reason }) {
            /** @type {Outcome} */
            const outcome = winner ?? 'draw';
            const finished = await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
                if (!game || game.status !== 'active' || !game.whiteId || !game.blackId) return null;
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
        },
    };
}

module.exports = { createGameFinalizer };
