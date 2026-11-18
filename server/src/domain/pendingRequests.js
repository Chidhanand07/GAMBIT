// @ts-check
/**
 * Requests between the players that stand until something happens: a draw offer
 * (ADR F-151), a takeback request (ADR F-152) and a queued premove (ADR F-153). Each lives in the Redis game state and is cleared by any move and
 * by the end of the game.
 */

/** State keys of the requests a move clears. */
const PENDING_KEYS = Object.freeze(['drawOffer', 'takeback']);
/**
 * What the end of the game and a takeback clear: the requests, and a queued premove
 * (ADR F-153). A move does not clear the premove: the move it waits for resolves it.
 */
const ALL_REQUEST_KEYS = Object.freeze([...PENDING_KEYS, 'premove']);

/**
 * Fields that clear every pending request `game` holds among `keys`. Keys that are
 * absent or already null are left out, so a game without requests keeps its exact shape.
 * @param {Record<string, unknown>} game
 * @param {ReadonlyArray<string>} [keys]
 * @returns {Record<string, null>}
 */
function clearedRequests(game, keys = PENDING_KEYS) {
    /** @type {Record<string, null>} */
    const out = {};
    for (const key of keys) if (game[key]) out[key] = null;
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

module.exports = { PENDING_KEYS, ALL_REQUEST_KEYS, clearedRequests, requestsView };
