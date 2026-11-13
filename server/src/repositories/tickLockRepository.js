// @ts-check
/**
 * Per-game tick locks (NODE-17): with several instances, each game's clock is
 * ticked by one instance per tick. `SET clocktick:<id> 1 PX <ms> NX`: whoever
 * sets it ticks; the key expires on its own, so a dead instance never blocks.
 */

/**
 * @param {{ set: (...args: any[]) => Promise<unknown> }} redis
 */
function createTickLockRepository(redis) {
    return {
        /**
         * @param {string} gameId
         * @param {number} ms how long this instance owns the tick
         * @returns {Promise<boolean>} true when this caller should tick the game now
         */
        async tryAcquire(gameId, ms) {
            return (await redis.set(`clocktick:${gameId}`, '1', 'PX', ms, 'NX')) === 'OK';
        },
    };
}

module.exports = { createTickLockRepository };
