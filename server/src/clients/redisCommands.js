// @ts-check
/**
 * Lua commands the repositories rely on for cross-instance correctness
 * (NODE-17). Defined once per connection with ioredis `defineCommand`, so the
 * script is sent by SHA after the first call. The Redis test double implements
 * the same commands in JavaScript; a real-Redis test runs the Lua itself.
 */

/**
 * casSetGame(key, expectedRaw, nextRaw, ttlSeconds) → 1 when written, 0 when the
 * stored value is no longer `expectedRaw` ('' means "no value"). A compare-and-
 * set on the whole stored state: any write by another instance in between
 * changes the JSON, so the caller re-reads and decides again.
 */
const CAS_SET_GAME = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == '') or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
  return 1
end
return 0
`;

/**
 * @template {{ defineCommand: (name: string, def: { numberOfKeys: number, lua: string }) => void }} R
 * @param {R} redis
 * @returns {R}
 */
function defineRedisCommands(redis) {
    redis.defineCommand('casSetGame', { numberOfKeys: 1, lua: CAS_SET_GAME });
    return redis;
}

module.exports = { defineRedisCommands, CAS_SET_GAME };
