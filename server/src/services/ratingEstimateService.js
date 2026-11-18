// @ts-check
/**
 * "You will lose this game and about N rating points" (Game.dc.html resign
 * dialog, ADR F-133): the real Glicko-2 change for a loss at the current
 * ratings, for a player of that live game only. Nothing is written.
 */
const { playerRejection } = require('../domain/moveAuthorization');
const { colorOfPlayer, opponentColor } = require('../domain/result');

const ESTIMATE_UNAVAILABLE = Object.freeze({ ok: false, error: 'estimate_unavailable' });
const UNRATED = Object.freeze({ ok: true, rated: false });

/**
 * @typedef {{ ok: true, rated: false } | { ok: true, rated: true, points: number } | { ok: false, error: string }} EstimateAck
 */

/**
 * @param {{ gameStore: { getGame: (id: string) => Promise<any> },
 *   ratingService: { estimate: (game: { whiteId: string, blackId: string, timeControl: unknown,
 *     result: 'white' | 'black' }) => Promise<import('./ratingService').RatingChanges | null> } }} deps
 */
function createRatingEstimateService({ gameStore, ratingService }) {
    return {
        /**
         * Points `userId` would lose by resigning `game_id` now.
         * @param {{ game_id: string }} data
         * @param {string} userId the connection's verified user
         * @returns {Promise<EstimateAck>}
         */
        async lossIfResigned({ game_id: gameId }, userId) {
            const game = await gameStore.getGame(gameId);
            const reason = playerRejection(game, userId);
            if (reason) return { ok: false, error: reason };
            if (!game.isRated) return UNRATED;
            const color = colorOfPlayer(userId, game.whiteId);
            const changes = await ratingService.estimate({
                whiteId: game.whiteId,
                blackId: game.blackId,
                timeControl: game.timeControl,
                result: opponentColor(color),
            });
            if (!changes) return ESTIMATE_UNAVAILABLE;
            return { ok: true, rated: true, points: Math.max(0, -changes[color].change) };
        },
    };
}

module.exports = { createRatingEstimateService };
