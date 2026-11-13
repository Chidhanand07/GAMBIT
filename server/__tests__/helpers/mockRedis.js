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
    /** key → epoch ms at which it expires (only keys written with `set(..., 'EX', seconds)`). */
    const expiries = new Map();

    /** Drop `key` if its TTL has passed (reads Date.now(), so tests can move the clock). */
    function expire(key) {
        if (expiries.has(key) && Date.now() >= expiries.get(key)) {
            strings.delete(key);
            expiries.delete(key);
        }
    }

    function maybeFail(cmd) {
        if (failures.has(cmd)) {
            failures.delete(cmd);
            throw new Error(`redis ${cmd} failed`);
        }
    }

    const redis = {
        async get(key) { maybeFail('get'); expire(key); return strings.has(key) ? strings.get(key) : null; },
        async set(key, value, mode, seconds) {
            maybeFail('set');
            strings.set(key, String(value));
            if (mode === 'EX') expiries.set(key, Date.now() + seconds * 1000);
            else expiries.delete(key);
            return 'OK';
        },
        /**
         * MULTI/EXEC for get/del. Like Redis, the queued commands run with nothing
         * interleaved (synchronously here); the result is [[err, value], ...].
         */
        multi() {
            const queued = [];
            const core = {
                get(key) { maybeFail('get'); expire(key); return strings.has(key) ? strings.get(key) : null; },
                del(key) { maybeFail('del'); expiries.delete(key); return strings.delete(key) ? 1 : 0; },
            };
            const tx = {
                get(key) { queued.push(() => core.get(key)); return tx; },
                del(key) { queued.push(() => core.del(key)); return tx; },
                async exec() {
                    maybeFail('exec');
                    return queued.map((run) => {
                        try { return [null, run()]; } catch (e) { return [e, null]; }
                    });
                },
            };
            return tx;
        },
        async setex(key, _ttl, value) { maybeFail('setex'); strings.set(key, String(value)); return 'OK'; },
        async del(key) { maybeFail('del'); expiries.delete(key); return strings.delete(key) ? 1 : 0; },
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
        _reset() { strings.clear(); sets.clear(); failures.clear(); expiries.clear(); },
        _strings: strings,
        _sets: sets,
    };
    return redis;
}

module.exports = { createRedisMock };
