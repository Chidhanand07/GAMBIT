// @ts-check
/**
 * The matchmaking queue in Redis, shared by every server instance (NODE-17).
 *
 *   {mm}:queue          sorted set: member = user id, score = joined_at (ms)
 *   {mm}:entry:<userId> the queue entry as JSON, with a TTL the owning
 *                       instance refreshes every pass (crashed instance →
 *                       its entries expire, then the next pass prunes them)
 *   {mm}:pairing-lock   which instance runs the pairing pass (SET NX PX)
 *
 * Every write that touches more than one key is one Lua script
 * (matchmakingQueueScripts.js). The `{mm}` hash tag keeps all keys in one
 * Redis Cluster slot, which multi-key scripts need.
 */
const { MATCHMAKING_SCRIPTS } = require('./matchmakingQueueScripts');

const DEFAULT_NAMESPACE = 'mm';
/** Two minutes: refreshed every second by the owning instance, so only a dead instance lets it lapse. */
const DEFAULT_ENTRY_TTL_MS = 120_000;

/**
 * @typedef {import('../domain/matchmaking/pairing').QueueEntry} QueueEntry
 * @typedef {(...args: Array<string | number>) => Promise<any>} Command
 * @typedef {{ [name: string]: any, defineCommand?: (name: string, def: { numberOfKeys: number, lua: string }) => void }} QueueRedis
 */

/**
 * Register the scripts once per client (a client shared by several
 * repositories keeps the first registration).
 * @param {QueueRedis} redis
 */
function defineScripts(redis) {
    for (const [name, def] of Object.entries(MATCHMAKING_SCRIPTS)) {
        if (typeof redis[name] !== 'function') redis.defineCommand?.(name, def);
    }
}

/**
 * @param {string | null} raw
 * @returns {QueueEntry | null}
 */
function parseEntry(raw) {
    return raw === null ? null : JSON.parse(raw);
}

/**
 * @param {QueueRedis} redis ioredis client (or a test double with the same commands)
 * @param {{ namespace?: string, entryTtlMs?: number }} [options]
 */
function createMatchmakingQueueRepository(
    redis,
    { namespace = DEFAULT_NAMESPACE, entryTtlMs = DEFAULT_ENTRY_TTL_MS } = {},
) {
    defineScripts(redis);
    const queueKey = `{${namespace}}:queue`;
    const lockKey = `{${namespace}}:pairing-lock`;
    /** @param {string} userId */
    const entryKey = (userId) => `{${namespace}}:entry:${userId}`;
    /** @type {(name: keyof typeof MATCHMAKING_SCRIPTS) => Command} */
    const script = (name) => redis[name].bind(redis);

    return {
        /**
         * Queue a player. A player already queued from the same socket is left as they are; an
         * entry from another socket (a reconnect) is replaced by this one, at the back [ACKS].
         * @param {QueueEntry} entry
         * @returns {Promise<number | null>} the queue size after joining, null when already queued
         */
        async add(entry) {
            const id = entry.user_id;
            const json = JSON.stringify(entry);
            const size = Number(
                await script('mmJoin')(queueKey, entryKey(id), id, json, entry.joined_at, entryTtlMs, entry.socketId),
            );
            return size === 0 ? null : size;
        },

        /**
         * @param {string} userId
         * @returns {Promise<QueueEntry | null>}
         */
        async get(userId) {
            return parseEntry(await redis.get(entryKey(userId)));
        },

        /**
         * Remove a player; with `socketId`, only an entry queued from that socket.
         * @param {string} userId
         * @param {string} [socketId]
         * @returns {Promise<boolean>} whether an entry was removed
         */
        async remove(userId, socketId = '') {
            return Number(await script('mmLeave')(queueKey, entryKey(userId), userId, socketId)) === 1;
        },

        /**
         * Every queued entry, longest-waiting first. Members whose entry expired are pruned.
         * @returns {Promise<QueueEntry[]>}
         */
        async list() {
            /** @type {string[]} */
            const ids = await redis.zrange(queueKey, 0, -1);
            if (ids.length === 0) return [];
            /** @type {Array<string | null>} */
            const raws = await redis.mget(...ids.map(entryKey));
            const missing = ids.filter((_, i) => raws[i] === null);
            await Promise.all(missing.map((id) => script('mmPrune')(queueKey, entryKey(id), id)));
            return /** @type {QueueEntry[]} */ (raws.map(parseEntry).filter(Boolean));
        },

        /** @returns {Promise<number>} queued players (expired ones count until the next `list`) */
        async size() {
            return Number(await redis.zcard(queueKey));
        },

        /**
         * Atomically take both players out of the queue for one game. False when
         * either has left, was claimed already, or re-queued since being read.
         * @param {QueueEntry} a
         * @param {QueueEntry} b
         * @returns {Promise<boolean>}
         */
        async claimPair(a, b) {
            const claimed = await script('mmClaimPair')(
                queueKey,
                entryKey(a.user_id),
                entryKey(b.user_id),
                a.user_id,
                a.joined_at,
                b.user_id,
                b.joined_at,
            );
            return Number(claimed) === 1;
        },

        /**
         * Extend the TTL of these players' entries.
         * @param {string[]} userIds
         * @returns {Promise<string[]>} the ones still queued
         */
        async touch(userIds) {
            const alive = await Promise.all(userIds.map((id) => redis.pexpire(entryKey(id), entryTtlMs)));
            return userIds.filter((_, i) => Number(alive[i]) === 1);
        },

        /**
         * @param {string} token unique per acquisition
         * @param {number} ttlMs
         * @returns {Promise<boolean>}
         */
        async acquirePairingLock(token, ttlMs) {
            return (await redis.set(lockKey, token, 'PX', ttlMs, 'NX')) === 'OK';
        },

        /**
         * @param {string} token
         * @returns {Promise<boolean>} false when the lock had expired or belongs to someone else
         */
        async releasePairingLock(token) {
            return Number(await script('mmUnlock')(lockKey, token)) === 1;
        },
    };
}

module.exports = { createMatchmakingQueueRepository, DEFAULT_ENTRY_TTL_MS };
