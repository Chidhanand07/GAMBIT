// @ts-check
/**
 * Lua scripts for the matchmaking queue (NODE-17: pairing is atomic, a lock is
 * released by compare-and-delete). Each runs as one atomic Redis command,
 * registered with ioredis `defineCommand` under the name it has here; the test
 * double in __tests__/helpers/mockRedisLua.js emulates the same names.
 *
 * Keys: KEYS[1] is always the queue sorted set (member = user id, score =
 * joined_at in ms); entry keys hold the queue entry as JSON with a TTL.
 */

/**
 * Queue a player unless they already have an entry.
 * KEYS: queue, entry. ARGV: userId, entryJson, joinedAtMs, ttlMs.
 * Returns 0 when already queued, otherwise the queue size (the new position).
 */
const mmJoin = {
    numberOfKeys: 2,
    lua: `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[4])
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1])
return redis.call('ZCARD', KEYS[1])
`,
};

/**
 * Take a player out of the queue. With a socket id, only when the entry was
 * queued from that socket (a disconnect must not remove a newer entry).
 * KEYS: queue, entry. ARGV: userId, socketId or ''.
 * Returns 1 when an entry was removed, 0 otherwise (a member whose entry has
 * already expired is dropped from the sorted set either way).
 */
const mmLeave = {
    numberOfKeys: 2,
    lua: `
local raw = redis.call('GET', KEYS[2])
if not raw then
  redis.call('ZREM', KEYS[1], ARGV[1])
  return 0
end
if ARGV[2] ~= '' and cjson.decode(raw).socketId ~= ARGV[2] then return 0 end
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`,
};

/**
 * Claim a pair for one game: both players leave the queue together, or
 * neither does. A player counts as present only when their entry exists AND
 * their queue score is still the joined_at the pairing pass read, so a player
 * who left and re-queued in between is not claimed with a stale entry.
 * KEYS: queue, entryA, entryB. ARGV: userA, joinedAtA, userB, joinedAtB.
 * Returns 1 for a claim, 0 otherwise.
 */
const mmClaimPair = {
    numberOfKeys: 3,
    lua: `
local function present(entryKey, user, joinedAt)
  if redis.call('EXISTS', entryKey) == 0 then return false end
  local score = redis.call('ZSCORE', KEYS[1], user)
  return score ~= false and tonumber(score) == tonumber(joinedAt)
end
if ARGV[1] == ARGV[3] then return 0 end
if not present(KEYS[2], ARGV[1], ARGV[2]) then return 0 end
if not present(KEYS[3], ARGV[3], ARGV[4]) then return 0 end
redis.call('DEL', KEYS[2], KEYS[3])
redis.call('ZREM', KEYS[1], ARGV[1], ARGV[3])
return 1
`,
};

/**
 * Drop a queue member whose entry expired (its instance stopped refreshing it).
 * KEYS: queue, entry. ARGV: userId. Returns 1 when the member was removed.
 */
const mmPrune = {
    numberOfKeys: 2,
    lua: `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
return redis.call('ZREM', KEYS[1], ARGV[1])
`,
};

/**
 * Release the pairing lock only if this holder still owns it (compare-and-delete).
 * KEYS: lock. ARGV: token. Returns 1 when released.
 */
const mmUnlock = {
    numberOfKeys: 1,
    lua: `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`,
};

const MATCHMAKING_SCRIPTS = Object.freeze({ mmJoin, mmLeave, mmClaimPair, mmPrune, mmUnlock });

module.exports = { MATCHMAKING_SCRIPTS };
