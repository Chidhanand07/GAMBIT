// @ts-check
/**
 * Game Review trigger: ask the engine to analyse a finished game. Fire-and-forget:
 * the engine runs it in the background and writes accuracy, per-move
 * classifications and the eval graph back to the games row.
 */
const { buildPgnFromMoveLog } = require('../domain/pgn');
const { log } = require('../observability/log');

/**
 * @typedef {object} ReviewEnginePort
 * @property {(p: { gameId: string, pgn: string, timeControl: string }) => Promise<{ ok: boolean, status: number }>} analyseGame
 */

/**
 * @param {object} deps
 * @param {ReviewEnginePort} deps.engineClient
 */
function createReviewService({ engineClient }) {
    return {
        /**
         * Start a review unless the move log has no SAN moves. Never awaited by
         * callers; failures are logged as warnings.
         * @param {string} gameId
         * @param {Parameters<typeof buildPgnFromMoveLog>[0]} moveLog
         * @param {unknown} timeControl
         * @returns {void}
         */
        triggerGameReview(gameId, moveLog, timeControl) {
            const pgn = buildPgnFromMoveLog(moveLog);
            if (!pgn) return;
            engineClient
                .analyseGame({ gameId, pgn, timeControl: String(timeControl ?? '10') })
                .then((res) => {
                    if (!res.ok) log.warn('[game_review] engine returned', res.status);
                })
                .catch((e) => log.warn('[game_review] trigger failed:', e.message));
        },
    };
}

module.exports = { createReviewService };
