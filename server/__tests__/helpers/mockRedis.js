/**
 * In-memory fake of the ioredis commands GAMBIT uses.
 *
 * Usage:
 *   jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());
 *   const redis = require('../lib/redis');
 *   redis._failNext('get');   // next `get` call rejects, to test error handling
 */
const { LUA_EMULATIONS } = require('./mockRedisLua');

function createRedisMock() {
    const strings = new Map();
    const sets = new Map();
    /** key → Map(member → score) */
    const zsets = new Map();
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

    /** Synchronous core for the sorted-set commands and the Lua emulations (mockRedisLua.js). */
    const sync = {
        get(key) { expire(key); return strings.has(key) ? strings.get(key) : null; },
        exists(key) { expire(key); return strings.has(key); },
        setPx(key, value, ms) { strings.set(key, String(value)); expiries.set(key, Date.now() + ms); },
        del(key) { expiries.delete(key); return strings.delete(key) ? 1 : 0; },
        zadd(key, score, member) {
            if (!zsets.has(key)) zsets.set(key, new Map());
            const z = zsets.get(key);
            const had = z.has(member);
            z.set(member, Number(score));
            return had ? 0 : 1;
        },
        zrem(key, member) {
            const z = zsets.get(key);
            const had = Boolean(z?.delete(member));
            if (z && z.size === 0) zsets.delete(key);
            return had ? 1 : 0;
        },
        zscore(key, member) { const z = zsets.get(key); return z?.has(member) ? String(z.get(member)) : null; },
        zcard(key) { return zsets.get(key)?.size ?? 0; },
        /** Members by score, ties by member (as Redis orders them). */
        zrange(key) {
            return [...(zsets.get(key) ?? new Map()).entries()]
                .sort(([ma, a], [mb, b]) => a - b || (ma < mb ? -1 : ma > mb ? 1 : 0))
                .map(([member]) => member);
        },
    };

    const redis = {
        async get(key) { maybeFail('get'); expire(key); return strings.has(key) ? strings.get(key) : null; },
        /** SET key value [EX s | PX ms] [NX]. */
        async set(key, value, ...options) {
            maybeFail('set');
            const nx = options.includes('NX');
            const ttlMs = options.includes('PX')
                ? Number(options[options.indexOf('PX') + 1])
                : options.includes('EX') ? Number(options[options.indexOf('EX') + 1]) * 1000 : null;
            expire(key);
            if (nx && strings.has(key)) return null;
            strings.set(key, String(value));
            if (ttlMs !== null) expiries.set(key, Date.now() + ttlMs);
            else expiries.delete(key);
            return 'OK';
        },
        /** The casSetGame Lua command (src/clients/redisCommands.js), in JavaScript. */
        async casSetGame(key, expected, next, _ttl) {
            maybeFail('setex');
            expire(key);
            const current = strings.has(key) ? strings.get(key) : null;
            if ((current === null && expected === '') || current === expected) {
                strings.set(key, String(next));
                return 1;
            }
            return 0;
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
                /** SET key value PX ms NX: only when the key does not exist. */
                setPxNx(key, value, ms) {
                    maybeFail('set'); expire(key);
                    if (strings.has(key)) return null;
                    strings.set(key, String(value)); expiries.set(key, Date.now() + ms); return 'OK';
                },
                incr(key) { maybeFail('incr'); expire(key); const n = Number(strings.get(key) ?? 0) + 1; strings.set(key, String(n)); return n; },
                pttl(key) { expire(key); if (!strings.has(key)) return -2; return expiries.has(key) ? expiries.get(key) - Date.now() : -1; },
            };
            const tx = {
                get(key) { queued.push(() => core.get(key)); return tx; },
                del(key) { queued.push(() => core.del(key)); return tx; },
                /** SET key value PX ms NX (the only form the code uses inside MULTI). */
                set(key, value, ...options) {
                    const [px, ms, nx] = options;
                    if (px !== 'PX' || nx !== 'NX') throw new Error('mock supports SET key value PX ms NX only');
                    queued.push(() => core.setPxNx(key, value, ms)); return tx;
                },
                incr(key) { queued.push(() => core.incr(key)); return tx; },
                pttl(key) { queued.push(() => core.pttl(key)); return tx; },
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
        async ping() { maybeFail('ping'); return 'PONG'; },
        async mget(...keys) { maybeFail('mget'); return keys.flat().map((k) => sync.get(k)); },
        async pexpire(key, ms) {
            maybeFail('pexpire');
            if (!sync.exists(key)) return 0;
            expiries.set(key, Date.now() + Number(ms));
            return 1;
        },
        async zadd(key, score, member) { maybeFail('zadd'); return sync.zadd(key, score, member); },
        async zrem(key, ...members) { maybeFail('zrem'); return members.reduce((n, m) => n + sync.zrem(key, m), 0); },
        async zscore(key, member) { maybeFail('zscore'); return sync.zscore(key, member); },
        async zcard(key) { maybeFail('zcard'); return sync.zcard(key); },
        /** ZRANGE key 0 -1 (the only range the code reads). */
        async zrange(key, start, stop) {
            maybeFail('zrange');
            if (Number(start) !== 0 || Number(stop) !== -1) throw new Error('mock supports ZRANGE key 0 -1 only');
            return sync.zrange(key);
        },
        /**
         * ioredis `defineCommand`: `redis[name](...keys, ...argv)` runs the JS
         * emulation of that script (mockRedisLua.js) atomically.
         */
        defineCommand(name, { numberOfKeys }) {
            const emulate = LUA_EMULATIONS[name];
            if (!emulate) throw new Error(`mockRedis has no emulation for Lua script "${name}"`);
            redis[name] = async (...args) => {
                maybeFail(name);
                const strs = args.map(String);
                return emulate(sync, strs.slice(0, numberOfKeys), strs.slice(numberOfKeys));
            };
        },
        on() { return redis; },

        _failNext(cmd) { failures.add(cmd); },
        _reset() { strings.clear(); sets.clear(); zsets.clear(); failures.clear(); expiries.clear(); },
        _strings: strings,
        _sets: sets,
        _zsets: zsets,
    };
    return redis;
}

module.exports = { createRedisMock };
