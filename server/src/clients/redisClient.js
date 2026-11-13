// @ts-check
/**
 * Factory for the ioredis connection used for live game state. Same options
 * and log lines as the original `server/lib/redis.js`.
 */
const { log } = require('../observability/log');
// The CommonJS export is the Redis class itself; the cast tells @ts-check so.
const Redis = /** @type {typeof import('ioredis').default} */ (/** @type {unknown} */ (require('ioredis')));

const MAX_CONNECT_RETRIES = 3;
const RETRY_STEP_MS = 200;
const MAX_RETRY_DELAY_MS = 2000;
const MAX_RETRIES_PER_REQUEST = 2;

/**
 * Back-off between reconnect attempts; gives up (returns null) after 3 tries.
 * @param {number} times attempt number, starting at 1
 * @returns {number | null}
 */
function retryStrategy(times) {
    if (times > MAX_CONNECT_RETRIES) {
        log.error('[Redis] Connection failed after 3 retries — game state will use Supabase fallback');
        return null;
    }
    return Math.min(times * RETRY_STEP_MS, MAX_RETRY_DELAY_MS);
}

/**
 * Create a lazily-connecting Redis client with connect/error logging.
 * @param {string} url Redis connection URL.
 * @returns {import('ioredis').Redis}
 */
function createRedisClient(url) {
    const redis = new Redis(url, {
        retryStrategy,
        lazyConnect: true,
        maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
    });

    redis.on('connect', () => log.info('[Redis] Connected'));
    redis.on('error', (err) => log.error('[Redis] Error:', err.message));

    return redis;
}

module.exports = { createRedisClient };
