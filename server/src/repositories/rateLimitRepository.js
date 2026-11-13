// @ts-check
/**
 * Rate-limit counters in Redis (NODE-12): one key per rule and subject, shared
 * by every server instance. One MULTI/EXEC creates the window (SET … PX … NX),
 * counts the hit (INCR) and reads what is left of the window (PTTL), so the
 * key always expires with its window.
 */

const KEY_PREFIX = 'ratelimit';

/**
 * @typedef {object} RateLimitRedis
 * @property {() => { set: Function, incr: Function, pttl: Function,
 *   exec: () => Promise<Array<[Error | null, unknown]> | null> }} multi
 */

/**
 * @param {RateLimitRedis} redis
 */
function createRateLimitRepository(redis) {
    return {
        /**
         * Count one hit for `key` in a window of `windowMs`.
         * @param {string} key rule and subject, e.g. `socketMove:u1:make_move`
         * @param {number} windowMs
         * @returns {Promise<{ count: number, ttlMs: number }>}
         * @throws when Redis fails
         */
        async hit(key, windowMs) {
            const redisKey = `${KEY_PREFIX}:${key}`;
            const results = await redis
                .multi()
                .set(redisKey, 0, 'PX', windowMs, 'NX')
                .incr(redisKey)
                .pttl(redisKey)
                .exec();
            if (!results) throw new Error('rate-limit transaction aborted');
            const failed = results.find(([error]) => error);
            if (failed) throw failed[0];
            return { count: Number(results[1][1]), ttlMs: Number(results[2][1]) };
        },
    };
}

module.exports = { createRateLimitRepository };
