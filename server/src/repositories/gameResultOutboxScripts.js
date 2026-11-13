// @ts-check
/**
 * Lua scripts for the game-result outbox (NODE-17: multi-key writes are one
 * atomic script; the worker lock is released by compare-and-delete). The
 * test double in __tests__/helpers/mockRedisLua.js emulates the same names.
 *
 * Keys: KEYS[1] item (JSON, no TTL: an item is only removed once its result is
 * in the database), KEYS[2] the `due` sorted set (score = next attempt, ms),
 * KEYS[3] the `parked` sorted set (score = when it was parked).
 */

/**
 * Queue an item unless one is queued for that game already.
 * KEYS: item, due. ARGV: gameId, json, dueAtMs. Returns 1 when queued, 0 when present.
 */
const outboxEnqueue = {
    numberOfKeys: 2,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
return 1
`,
};

/**
 * Store the updated item and its next attempt, only if it still exists (an item
 * another worker finished is not brought back).
 * KEYS: item, due. ARGV: gameId, json, dueAtMs. Returns 1 when stored.
 */
const outboxReschedule = {
    numberOfKeys: 2,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
return 1
`,
};

/**
 * Stop automatic attempts: keep the item, move it from `due` to `parked`.
 * KEYS: item, due, parked. ARGV: gameId, json, parkedAtMs. Returns 1 when parked.
 */
const outboxPark = {
    numberOfKeys: 3,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
return 1
`,
};

/**
 * Forget an item (its result is in the database). KEYS: item, due, parked. ARGV: gameId.
 * Returns 1 when an item was deleted.
 */
const outboxRemove = {
    numberOfKeys: 3,
    lua: `
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
return redis.call('DEL', KEYS[1])
`,
};

/**
 * Operator re-drive of a parked item: back into `due` at ARGV[2].
 * KEYS: item, due, parked. ARGV: gameId, dueAtMs. Returns 1 when requeued.
 */
const outboxRequeue = {
    numberOfKeys: 3,
    lua: `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
return 1
`,
};

/** Release the worker lock only if this worker still holds it. KEYS: lock. ARGV: token. */
const outboxUnlock = {
    numberOfKeys: 1,
    lua: `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`,
};

const OUTBOX_SCRIPTS = Object.freeze({
    outboxEnqueue,
    outboxReschedule,
    outboxPark,
    outboxRemove,
    outboxRequeue,
    outboxUnlock,
});

module.exports = { OUTBOX_SCRIPTS };
