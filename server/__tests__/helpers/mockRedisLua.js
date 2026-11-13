/**
 * JavaScript emulations of the Lua scripts the code registers with ioredis
 * `defineCommand`, for createRedisMock(). Each mirrors its script line by line
 * (src/repositories/matchmakingQueueScripts.js) and runs synchronously, so
 * like a real script nothing interleaves with it. The real-Redis contract run
 * (__tests__/repositories/matchmakingQueue.contract.test.js) checks the Lua
 * itself behaves the same.
 *
 * `r` is the mock's synchronous core: get, set, setPx, del, exists, zadd, zrem,
 * zscore, zcard. KEYS and ARGV arrive as strings, as they do in Redis.
 * The outbox scripts mirror src/repositories/gameResultOutboxScripts.js
 * (checked against real Redis by repositories/gameResultOutbox.contract.test.js).
 */
const LUA_EMULATIONS = {
    mmJoin(r, [queue, entry], [userId, json, joinedAt, ttlMs]) {
        if (r.exists(entry)) return 0;
        r.setPx(entry, json, Number(ttlMs));
        r.zadd(queue, Number(joinedAt), userId);
        return r.zcard(queue);
    },

    mmLeave(r, [queue, entry], [userId, socketId]) {
        const raw = r.get(entry);
        if (raw === null) {
            r.zrem(queue, userId);
            return 0;
        }
        if (socketId !== '' && JSON.parse(raw).socketId !== socketId) return 0;
        r.del(entry);
        r.zrem(queue, userId);
        return 1;
    },

    mmClaimPair(r, [queue, entryA, entryB], [userA, joinedA, userB, joinedB]) {
        const present = (key, user, joined) => {
            if (!r.exists(key)) return false;
            const score = r.zscore(queue, user);
            return score !== null && Number(score) === Number(joined);
        };
        if (userA === userB) return 0;
        if (!present(entryA, userA, joinedA)) return 0;
        if (!present(entryB, userB, joinedB)) return 0;
        r.del(entryA);
        r.del(entryB);
        r.zrem(queue, userA);
        r.zrem(queue, userB);
        return 1;
    },

    mmPrune(r, [queue, entry], [userId]) {
        if (r.exists(entry)) return 0;
        return r.zrem(queue, userId);
    },

    mmUnlock(r, [lock], [token]) {
        if (r.get(lock) === token) return r.del(lock);
        return 0;
    },

    outboxEnqueue(r, [item, due], [gameId, json, dueAt]) {
        if (r.exists(item)) return 0;
        r.set(item, json);
        r.zadd(due, Number(dueAt), gameId);
        return 1;
    },

    outboxReschedule(r, [item, due], [gameId, json, dueAt]) {
        if (!r.exists(item)) return 0;
        r.set(item, json);
        r.zadd(due, Number(dueAt), gameId);
        return 1;
    },

    outboxPark(r, [item, due, parked], [gameId, json, parkedAt]) {
        if (!r.exists(item)) return 0;
        r.set(item, json);
        r.zrem(due, gameId);
        r.zadd(parked, Number(parkedAt), gameId);
        return 1;
    },

    outboxRemove(r, [item, due, parked], [gameId]) {
        r.zrem(due, gameId);
        r.zrem(parked, gameId);
        return r.del(item);
    },

    outboxRequeue(r, [item, due, parked], [gameId, dueAt]) {
        if (!r.exists(item)) return 0;
        r.zrem(parked, gameId);
        r.zadd(due, Number(dueAt), gameId);
        return 1;
    },

    outboxUnlock(r, [lock], [token]) {
        if (r.get(lock) === token) return r.del(lock);
        return 0;
    },
};

module.exports = { LUA_EMULATIONS };
