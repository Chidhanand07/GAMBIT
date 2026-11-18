// @ts-check
/**
 * `rating_estimate`: what resigning would cost the asking player (ADR F-133).
 * The player is the connection's verified user; only the game id is read.
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @typedef {object} RatingEstimateHandlerService
 * @property {(data: { game_id: string }, userId: string) => Promise<unknown>} lossIfResigned
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ ratingEstimates: RatingEstimateHandlerService, log?: import('../../observability/log').Log }} deps
 */
function registerRatingHandlers(socket, { ratingEstimates, log }) {
    /** @type {string} */
    const userId = socket.data.userId;
    socket.on(
        'rating_estimate',
        wrap('rating_estimate', schemas.rating_estimate, (data) => ratingEstimates.lossIfResigned(data, userId), log),
    );
}

module.exports = { registerRatingHandlers };
