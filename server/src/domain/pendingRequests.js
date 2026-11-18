// @ts-check
/**
 * Requests between the players that stand until something happens: a draw offer
 * (ADR F-151) and a takeback request (ADR F-152). Each lives in the Redis game state and is cleared by any move and
 * by the end of the game.
 */

/** State keys of the requests a move or the end of the game clears. */
const PENDING_KEYS = Object.freeze(['drawOffer', 'takeback']);

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

/**
 * The standing requests a (re)joining client must see in `game_state_sync`, each only
 * when there is one (an older client ignores the extra keys): the draw offer and each
 * side's last offer, the takeback request and each player's takeback setting.
 * @param {any} game
 */
function requestsView(game) {
    return {
        ...(game.drawOffer ? { drawOffer: { by: game.drawOffer.by } } : {}),
        ...(game.lastDrawOfferPly ? { lastDrawOfferPly: game.lastDrawOfferPly } : {}),
        ...(game.takeback ? { takeback: { by: game.takeback.by, plies: game.takeback.plies } } : {}),
        ...(game.takebackPrefs ? { takebackPrefs: game.takebackPrefs } : {}),
    };
}

module.exports = { PENDING_KEYS, clearedRequests, requestsView };
