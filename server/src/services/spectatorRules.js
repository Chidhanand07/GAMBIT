// @ts-check
/**
 * The spectator limit the socket schema checks at the boundary (NODE-08); entry
 * adapters may not import `domain/` directly, so it is exposed here unchanged.
 */
const { MAX_COUNT_REQUEST } = require('../domain/spectators');

module.exports = { MAX_COUNT_REQUEST };
