// @ts-check
/**
 * The game-result outbox in Redis (ERRORS, ADR F-066): finished games whose
 * `games` row could not be written after the finalizer's retries wait here
 * until a worker writes them. Shared by every server instance.
 *
 *   {outbox}:item:<gameId>  the item as JSON (no TTL: never dropped silently)
 *   {outbox}:due            sorted set: game id, score = next attempt (ms)
 *   {outbox}:parked         sorted set: game id, score = when it was parked
 *                           (gave up retrying; kept for an operator)
 *   {outbox}:lock           which worker runs the pass (SET NX PX, token)
 *
 * Multi-key writes are Lua scripts (gameResultOutboxScripts.js). The `{outbox}`
 * hash tag keeps every key in one Redis Cluster slot.
 */
const { OUTBOX_SCRIPTS } = require('./gameResultOutboxScripts');

const DEFAULT_NAMESPACE = 'outbox';

/**
 * @typedef {object} OutboxItem
 * @property {string} gameId
 * @property {object} row the finished `games` row (finishIfActive fields)
 * @property {'white' | 'black' | 'draw' | 'aborted'} outcome
 * @property {string} whiteId
 * @property {string} blackId
 * @property {unknown} timeControl
 * @property {boolean} isRated
 * @property {unknown[]} moveLog for the post-game review
 * @property {number} attempts failed re-drives so far
 * @property {number} firstFailedAt ms, when the finalizer gave up
 * @property {string} lastError
 *
 * @typedef {object} ResultOutbox the port (TEST-08: see repositories/gameResultOutbox.contract.test.js)
 * @property {(item: OutboxItem, dueAt: number) => Promise<boolean>} enqueue false when that game is queued already
 * @property {(now: number, limit: number) => Promise<OutboxItem[]>} due items whose next attempt is at or before `now`
 * @property {(item: OutboxItem, dueAt: number) => Promise<boolean>} reschedule false when the item is gone
 * @property {(item: OutboxItem, parkedAt: number) => Promise<boolean>} park
 * @property {(gameId: string) => Promise<boolean>} remove
 * @property {(gameId: string, dueAt: number) => Promise<boolean>} requeue a parked item, by an operator
 * @property {() => Promise<OutboxItem[]>} parked
 * @property {(token: string, ttlMs: number) => Promise<boolean>} acquireLock
 * @property {(token: string) => Promise<boolean>} releaseLock false when expired or held by another worker
 *
 * @typedef {(...args: Array<string | number>) => Promise<any>} Command
 * @typedef {{ [name: string]: any, defineCommand?: (name: string, def: { numberOfKeys: number, lua: string }) => void }} OutboxRedis
 */

/** @param {OutboxRedis} redis */
function defineScripts(redis) {
    for (const [name, def] of Object.entries(OUTBOX_SCRIPTS)) {
        if (typeof redis[name] !== 'function') redis.defineCommand?.(name, def);
    }
}

/**
 * @param {OutboxRedis} redis ioredis client (or a test double with the same commands)
 * @param {{ namespace?: string }} [options]
 * @returns {ResultOutbox}
 */
function createGameResultOutboxRepository(redis, { namespace = DEFAULT_NAMESPACE } = {}) {
    defineScripts(redis);
    const dueKey = `{${namespace}}:due`;
    const parkedKey = `{${namespace}}:parked`;
    const lockKey = `{${namespace}}:lock`;
    /** @param {string} gameId */
    const itemKey = (gameId) => `{${namespace}}:item:${gameId}`;
    /** @type {(name: keyof typeof OUTBOX_SCRIPTS) => Command} */
    const script = (name) => redis[name].bind(redis);
    const ok = (/** @type {unknown} */ reply) => Number(reply) === 1;

    /**
     * The items for `ids`; an id whose item is gone is dropped from both sets.
     * @param {string[]} ids
     * @returns {Promise<OutboxItem[]>}
     */
    async function load(ids) {
        if (ids.length === 0) return [];
        const raws = await redis.mget(...ids.map(itemKey));
        const orphans = ids.filter((_, i) => raws[i] === null);
        await Promise.all(orphans.map((id) => script('outboxRemove')(itemKey(id), dueKey, parkedKey, id)));
        return raws.filter((raw) => raw !== null).map((raw) => JSON.parse(raw));
    }

    return {
        enqueue: async (item, dueAt) =>
            ok(await script('outboxEnqueue')(itemKey(item.gameId), dueKey, item.gameId, JSON.stringify(item), dueAt)),
        due: async (now, limit) => load(await redis.zrangebyscore(dueKey, '-inf', now, 'LIMIT', 0, limit)),
        reschedule: async (item, dueAt) =>
            ok(
                await script('outboxReschedule')(
                    itemKey(item.gameId),
                    dueKey,
                    item.gameId,
                    JSON.stringify(item),
                    dueAt,
                ),
            ),
        park: async (item, parkedAt) =>
            ok(
                await script('outboxPark')(
                    itemKey(item.gameId),
                    dueKey,
                    parkedKey,
                    item.gameId,
                    JSON.stringify(item),
                    parkedAt,
                ),
            ),
        remove: async (gameId) => ok(await script('outboxRemove')(itemKey(gameId), dueKey, parkedKey, gameId)),
        requeue: async (gameId, dueAt) =>
            ok(await script('outboxRequeue')(itemKey(gameId), dueKey, parkedKey, gameId, dueAt)),
        parked: async () => load(await redis.zrange(parkedKey, 0, -1)),
        acquireLock: async (token, ttlMs) => (await redis.set(lockKey, token, 'PX', ttlMs, 'NX')) === 'OK',
        releaseLock: async (token) => ok(await script('outboxUnlock')(lockKey, token)),
    };
}

module.exports = { createGameResultOutboxRepository };
