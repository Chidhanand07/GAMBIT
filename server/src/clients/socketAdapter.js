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

/**
 * @param {string} url
 * @returns {{ adapter: ReturnType<typeof createAdapter>, close: () => Promise<void> }}
 */
function createSocketAdapter(url) {
    const redis = new Redis(url);
    return {
        adapter: createAdapter(redis),
        // quit, not disconnect: closing the server persists every socket's recovery session
        // through this connection without awaiting it; quit lets those writes finish.
        close: async () => {
            await redis.quit();
        },
    };
}

module.exports = { createSocketAdapter };
