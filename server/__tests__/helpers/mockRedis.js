/**
 * In-memory fake of the ioredis commands GAMBIT uses.
 *
 * Usage:
 *   jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());
 *   const redis = require('../lib/redis');
 *   redis._failNext('get');   // next `get` call rejects, to test error handling
 */
function createRedisMock() {
    const strings = new Map();
    const sets = new Map();
    const failures = new Set();

    function maybeFail(cmd) {
        if (failures.has(cmd)) {
            failures.delete(cmd);
            throw new Error(`redis ${cmd} failed`);
        }
    }

    const redis = {
        async get(key) { maybeFail('get'); return strings.has(key) ? strings.get(key) : null; },
        async set(key, value) { maybeFail('set'); strings.set(key, String(value)); return 'OK'; },
        async setex(key, _ttl, value) { maybeFail('setex'); strings.set(key, String(value)); return 'OK'; },
        async del(key) { maybeFail('del'); return strings.delete(key) ? 1 : 0; },
        async sadd(key, member) {
            maybeFail('sadd');
            if (!sets.has(key)) sets.set(key, new Set());
            const s = sets.get(key);
            const had = s.has(member);
            s.add(member);
            return had ? 0 : 1;
        },
        async srem(key, member) { maybeFail('srem'); return sets.get(key)?.delete(member) ? 1 : 0; },
        async smembers(key) { maybeFail('smembers'); return [...(sets.get(key) ?? [])]; },
        on() { return redis; },

        _failNext(cmd) { failures.add(cmd); },
        _reset() { strings.clear(); sets.clear(); failures.clear(); },
        _strings: strings,
        _sets: sets,
    };
    return redis;
}

module.exports = { createRedisMock };
