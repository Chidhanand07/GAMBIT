// @ts-check
/**
 * What follows once a finished game's `games` row is in the database: the
 * post-game review and the rating, then `rating_updated` to the game room.
 * Shared by the finalizer (the normal path) and the result outbox worker
 * (re-drive after a database outage, ADR F-066), so both do the same thing.
 */
const { gameRoom } = require('./emitter');

const DEFAULT_TIME_CONTROL = '10';

/**
 * @typedef {object} ResultJob the server-side facts of a finished game
 * @property {string} gameId
 * @property {'white' | 'black' | 'draw' | 'aborted'} outcome
 * @property {string} whiteId
 * @property {string} blackId
 * @property {unknown} timeControl
 * @property {boolean} isRated
 * @property {unknown} moveLog
 *
 * @typedef {object} EffectDeps
 * @property {{ processGameEnd: Function }} ratingService
 * @property {{ triggerGameReview: (gameId: string, moveLog: any, timeControl: unknown) => void }} reviewService
 * @property {import('./emitter').Emitter} emitter
 */

/**
 * The job for `game` (server state after the transition).
 * @param {string} gameId
 * @param {any} game
 * @param {ResultJob['outcome']} outcome
 * @returns {ResultJob}
 */
function resultJob(gameId, game, outcome) {
    return {
        gameId,
        outcome,
        whiteId: game.whiteId,
        blackId: game.blackId,
        timeControl: game.timeControl ?? DEFAULT_TIME_CONTROL,
        isRated: game.isRated ?? false,
        moveLog: game.moveLog ?? [],
    };
}

/**
 * Review (only when `review`: the caller's write is the one that finished the row) and rate.
 * Rating is idempotent per game (apply_game_result sets rated_at once), so calling it again for
 * a game that is already rated changes nothing. An aborted game is neither reviewed nor rated.
 * @param {EffectDeps} deps
 * @param {ResultJob} job
 * @param {{ review: boolean }} options
 */
async function applyResultEffects({ ratingService, reviewService, emitter }, job, { review }) {
    if (job.outcome === 'aborted') return;
    // Full Game Review in the engine (depth-18 Stockfish per move); fire-and-forget.
    if (review) reviewService.triggerGameReview(job.gameId, job.moveLog, job.timeControl);
    const { gameId, whiteId, blackId, outcome, timeControl, isRated } = job;
    const changes = await ratingService.processGameEnd(gameId, whiteId, blackId, outcome, timeControl, isRated);
    if (changes) emitter.toRoom(gameRoom(gameId), 'rating_updated', changes);
}

module.exports = { resultJob, applyResultEffects };
