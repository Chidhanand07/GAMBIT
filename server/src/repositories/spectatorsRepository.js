// @ts-check
/**
 * Who is watching each game, in Redis, shared by every server instance (ADR F-130).
 *
 *   {spec}:game:<gameId>  sorted set: member `<userId>:<socketId>`, score = when it lapses (ms)
 *   {spec}:games          set of game ids that may have spectators (the prune pass walks it)
 *
 * The instance that holds a spectator's socket moves its score forward every heartbeat;
 * a crashed instance stops doing so, and its members lapse and are pruned. Every write is
 * one Lua script, so a join, a leave and a prune never interleave. `{spec}` is a hash tag:
 * both keys a script touches are in one Redis Cluster slot.
 */

const DEFAULT_NAMESPACE = 'spec';

/** Add (or refresh) a member, drop lapsed ones; returns {added, members}. */
const SPEC_JOIN = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
local added = redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
redis.call('SADD', KEYS[2], ARGV[5])
return {added, redis.call('ZRANGE', KEYS[1], 0, -1)}
`;

/** Remove a member, drop lapsed ones; returns {changed, members}. */
const SPEC_LEAVE = `
local changed = redis.call('ZREM', KEYS[1], ARGV[1])
changed = changed + redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
if #members == 0 then redis.call('SREM', KEYS[2], ARGV[3]) end
return {changed, members}
`;

/** Drop lapsed members; returns {removed, members}. */
const SPEC_PRUNE = `
local removed = redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
if #members == 0 then redis.call('SREM', KEYS[2], ARGV[2]) end
return {removed, members}
`;

/** Move a member's lapse time forward, only if it is still there; returns 1 when refreshed. */
const SPEC_REFRESH = `
if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

const SPECTATOR_SCRIPTS = Object.freeze({
    specJoin: { numberOfKeys: 2, lua: SPEC_JOIN },
    specLeave: { numberOfKeys: 2, lua: SPEC_LEAVE },
    specPrune: { numberOfKeys: 2, lua: SPEC_PRUNE },
    specRefresh: { numberOfKeys: 1, lua: SPEC_REFRESH },
});

/**
 * @typedef {(...args: Array<string | number>) => Promise<any>} Command
 * @typedef {{ [name: string]: any, defineCommand?: (name: string, def: { numberOfKeys: number, lua: string }) => void,
 *   smembers: (key: string) => Promise<string[]> }} SpectatorRedis
 * @typedef {{ changed: boolean, members: string[] }} SpectatorSet
 * @typedef {{ gameId: string, member: string, now: number }} MemberRef
 */

/**
 * @param {unknown} reply `[number, string[]]` from a script
 * @returns {SpectatorSet}
 */
function toSet(reply) {
    const [n, members] = /** @type {[number, string[]]} */ (reply);
    return { changed: Number(n) > 0, members: members ?? [] };
}

/**
 * @param {SpectatorRedis} redis ioredis client (or a test double with the same commands)
 * @param {{ namespace?: string, ttlMs: number }} options
 */
function createSpectatorsRepository(redis, { namespace = DEFAULT_NAMESPACE, ttlMs }) {
    for (const [name, def] of Object.entries(SPECTATOR_SCRIPTS)) {
        if (typeof redis[name] !== 'function') redis.defineCommand?.(name, def);
    }
    const gamesKey = `{${namespace}}:games`;
    /** @param {string} gameId */
    const gameKey = (gameId) => `{${namespace}}:game:${gameId}`;
    /** @type {(name: keyof typeof SPECTATOR_SCRIPTS) => Command} */
    const script = (name) => redis[name].bind(redis);
    // The key outlives its members by one TTL, so an abandoned set goes away by itself.
    const keyTtlMs = 2 * ttlMs;

    return {
        /** @param {MemberRef} ref @returns {Promise<SpectatorSet>} changed: the member is new */
        async add({ gameId, member, now }) {
            const reply = await script('specJoin')(
                gameKey(gameId),
                gamesKey,
                member,
                now + ttlMs,
                now,
                keyTtlMs,
                gameId,
            );
            return toSet(reply);
        },
        /** @param {MemberRef} ref @returns {Promise<SpectatorSet>} changed: a member left or lapsed */
        async remove({ gameId, member, now }) {
            return toSet(await script('specLeave')(gameKey(gameId), gamesKey, member, now, gameId));
        },
        /** @param {string} gameId @param {number} now @returns {Promise<SpectatorSet>} changed: some lapsed */
        async prune(gameId, now) {
            return toSet(await script('specPrune')(gameKey(gameId), gamesKey, now, gameId));
        },
        /** @param {MemberRef} ref @returns {Promise<boolean>} false when the member is gone */
        async refresh({ gameId, member, now }) {
            return Number(await script('specRefresh')(gameKey(gameId), member, now + ttlMs, keyTtlMs)) === 1;
        },
        /** Games that may have spectators. @returns {Promise<string[]>} */
        games: () => redis.smembers(gamesKey),
    };
}

module.exports = { createSpectatorsRepository, SPECTATOR_SCRIPTS };
