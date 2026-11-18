// @ts-check
/**
 * Requests between the players that stand until something happens (ADR F-151): a
 * draw offer. Each lives in the Redis game state and is cleared by any move and
 * by the end of the game.
 */

/** State keys of the requests a move or the end of the game clears. */
const PENDING_KEYS = Object.freeze(['drawOffer']);

/**
 * Fields that clear every pending request `game` holds. Keys that are absent or
 * already null are left out, so a game without requests keeps its exact shape.
 * @param {Record<string, unknown>} game
 * @returns {Record<string, null>}
 */
function clearedRequests(game) {
    /** @type {Record<string, null>} */
    const out = {};
    for (const key of PENDING_KEYS) if (game[key]) out[key] = null;
    return out;
}

module.exports = { PENDING_KEYS, clearedRequests };
