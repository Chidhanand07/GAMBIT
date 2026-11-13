// @ts-check
/**
 * The Socket.IO Redis Streams adapter (NODE-15): rooms, broadcasts and
 * fetchSockets span every server instance. It needs its own Redis connection
 * (it blocks on XREAD). The Streams adapter, unlike the Pub/Sub one, supports
 * connection state recovery.
 */
// The CommonJS export is the Redis class itself; the cast tells @ts-check so.
const Redis = /** @type {typeof import('ioredis').default} */ (/** @type {unknown} */ (require('ioredis')));
const { createAdapter } = require('@socket.io/redis-streams-adapter');
const { log } = require('../observability/log');

/** The writes the adapter can fire without awaiting: session SETs, heartbeat and response XADDs. */
const UNAWAITED_WRITES = Object.freeze(['set', 'xadd', 'publish']);

/**
 * The adapter persists each disconnecting socket's recovery session (SET) and sends heartbeats
 * and responses (XADD, PUBLISH) without awaiting them. With Redis unreachable those promises
 * rejected unhandled, and an unhandled rejection is fatal (F-056): every disconnect or heartbeat
 * during a Redis blip would have restarted the replica. Log them instead. The original promise is
 * returned, so a caller that awaits still sees the error.
 * @template {object} C
 * @param {C} client an ioredis client
 * @returns {C} the same client
 */
function handleUnawaitedWrites(client) {
    const methods = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (client));
    for (const method of UNAWAITED_WRITES) {
        const original = methods[method];
        if (typeof original !== 'function') continue;
        methods[method] = (/** @type {unknown[]} */ ...args) => {
            const pending = /** @type {Promise<unknown>} */ (original.apply(client, args));
            pending.catch((/** @type {Error} */ e) =>
                log.warn(`[socket adapter] a Redis ${method} failed:`, e.message),
            );
            return pending;
        };
    }
    return client;
}

/**
 * @param {string} url
 * @param {{ streamName?: string }} [options] the Redis stream all replicas share (default
 *   `socket.io`); tests give each suite its own so suites on one Redis do not see each other
 * @returns {{ adapter: ReturnType<typeof createAdapter>, close: () => Promise<void> }}
 */
function createSocketAdapter(url, options = {}) {
    const redis = handleUnawaitedWrites(new Redis(url));
    return {
        adapter: createAdapter(redis, options.streamName ? { streamName: options.streamName } : {}),
        // quit, not disconnect: closing the server persists every socket's recovery session
        // through this connection without awaiting it; quit lets those writes finish.
        close: async () => {
            await redis.quit();
        },
    };
}

module.exports = { createSocketAdapter, handleUnawaitedWrites };
