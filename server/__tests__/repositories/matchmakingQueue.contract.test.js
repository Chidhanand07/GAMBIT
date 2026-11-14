/**
 * Shared contract for the MatchmakingQueue port (SOLID-04, TEST-08): the Redis
 * repository (on the in-memory mock AND on a real Redis, so the Lua scripts
 * themselves run) and the in-memory fake the service tests use must behave
 * the same. [MULTI-INSTANCE, NODE-17]
 *
 * Each implementation factory returns two handles on ONE queue (`a`, `b`):
 * for real Redis they use two separate connections, like two server instances.
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createMatchmakingQueueRepository } = require('../../src/repositories/matchmakingQueueRepository');
const { fakeMatchmakingQueue } = require('../services/fakeMatchmakingQueue');
const realRedis = require('../helpers/realRedis');

const T0 = 1_767_268_800_000;

function entry(id, joinedOffset = 0, overrides = {}) {
    return {
        user_id: id,
        username: `${id}-name`,
        rating: 1500,
        isProvisional: false,
        time_control: '10+0',
        increment: 0,
        isRated: true,
        joined_at: T0 + joinedOffset,
        socketId: `sock-${id}`,
        ...overrides,
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let real = null;
if (realRedis.available) {
    beforeAll(async () => {
        real = await realRedis.startRealRedis();
    });
    afterAll(async () => {
        await real?.stop();
    });
} else {
    test.skip(`real Redis contract run — ${realRedis.SKIP_REASON}`, () => {});
}

const implementations = [
    [
        'in-memory fake',
        ({ entryTtlMs } = {}) => {
            const q = fakeMatchmakingQueue({ entryTtlMs });
            return { a: q, b: q };
        },
    ],
    [
        'Redis repository on the mock',
        ({ entryTtlMs } = {}) => {
            const redis = createRedisMock();
            return {
                a: createMatchmakingQueueRepository(redis, { entryTtlMs }),
                b: createMatchmakingQueueRepository(redis, { entryTtlMs }),
            };
        },
    ],
];
if (realRedis.available) {
    implementations.push([
        'Redis repository on real Redis (Lua)',
        ({ entryTtlMs } = {}) => {
            const namespace = realRedis.uniqueNamespace('mmq');
            return {
                a: createMatchmakingQueueRepository(real.client(), { namespace, entryTtlMs }),
                b: createMatchmakingQueueRepository(real.client(), { namespace, entryTtlMs }),
            };
        },
    ]);
}

describe.each(implementations)('matchmaking queue contract: %s', (_name, create) => {
    test('add returns the queue size; get returns the entry; unknown → null', async () => {
        const { a } = create();
        expect(await a.get('x')).toBeNull();
        expect(await a.add(entry('x'))).toBe(1);
        expect(await a.add(entry('y', 5))).toBe(2);
        expect(await a.get('x')).toEqual(entry('x'));
        expect(await a.size()).toBe(2);
    });

    test('adding a player already queued from the same socket is a no-op (null) and keeps the first entry', async () => {
        const { a, b } = create();
        await a.add(entry('x'));
        // Was: a no-op for ANY socket (pinned with socketId 'other'); see the reconnect case below [ACKS].
        expect(await b.add(entry('x', 99, { time_control: '5+0' }))).toBeNull();
        expect(await a.get('x')).toEqual(entry('x'));
        expect(await a.size()).toBe(1);
    });

    test('a join from another socket (the client reconnected) takes the entry over, at the back of the queue [ACKS]', async () => {
        const { a, b } = create();
        await a.add(entry('x'));
        await a.add(entry('y', 5));
        const rejoined = entry('x', 50, { socketId: 'sock-x-reconnected' });
        expect(await b.add(rejoined)).toBe(2);
        expect(await a.get('x')).toEqual(rejoined);
        expect((await a.list()).map((e) => e.user_id)).toEqual(['y', 'x']);
        // The old socket's late disconnect does not take the player out of the queue...
        expect(await a.remove('x', 'sock-x')).toBe(false);
        expect(await a.get('x')).toEqual(rejoined);
        // ...and the new entry is claimable with the joined_at it carries.
        expect(await b.claimPair(rejoined, entry('y', 5))).toBe(true);
    });

    test('list: every entry, longest-waiting first (ties by user id)', async () => {
        const { a } = create();
        await a.add(entry('late', 30));
        await a.add(entry('first', 0));
        await a.add(entry('mid-b', 10));
        await a.add(entry('mid-a', 10));
        expect((await a.list()).map((e) => e.user_id)).toEqual(['first', 'mid-a', 'mid-b', 'late']);
        expect(await create().a.list()).toEqual([]);
    });

    test('remove by user id: true once, then false', async () => {
        const { a } = create();
        await a.add(entry('x'));
        expect(await a.remove('x')).toBe(true);
        expect(await a.remove('x')).toBe(false);
        expect(await a.get('x')).toBeNull();
        expect(await a.size()).toBe(0);
    });

    test('remove with a socket id only removes an entry queued from that socket', async () => {
        const { a } = create();
        await a.add(entry('x'));
        expect(await a.remove('x', 'some-other-socket')).toBe(false);
        expect(await a.get('x')).toEqual(entry('x'));
        expect(await a.remove('x', 'sock-x')).toBe(true);
        expect(await a.size()).toBe(0);
    });

    test('claimPair takes both players out of the queue, once', async () => {
        const { a } = create();
        await a.add(entry('x'));
        await a.add(entry('y', 1));
        await a.add(entry('z', 2));
        expect(await a.claimPair(entry('x'), entry('y', 1))).toBe(true);
        expect(await a.claimPair(entry('x'), entry('y', 1))).toBe(false);
        expect((await a.list()).map((e) => e.user_id)).toEqual(['z']);
        expect(await a.size()).toBe(1);
    });

    test('claimPair claims nobody when either player is gone', async () => {
        const { a } = create();
        await a.add(entry('x'));
        await a.add(entry('y', 1));
        await a.remove('y');
        expect(await a.claimPair(entry('x'), entry('y', 1))).toBe(false);
        expect(await a.get('x')).toEqual(entry('x'));
        expect(await a.claimPair(entry('x'), entry('x'))).toBe(false);
        expect(await a.get('x')).toEqual(entry('x'));
    });

    test('claimPair refuses a stale read: a player who left and re-queued is not claimed', async () => {
        const { a } = create();
        await a.add(entry('x'));
        await a.add(entry('y', 1));
        const stale = await a.list();
        await a.remove('y');
        await a.add(entry('y', 500, { time_control: '3+2' }));
        expect(await a.claimPair(stale[0], stale[1])).toBe(false);
        expect(await a.size()).toBe(2);
    });

    test('two concurrent claims of overlapping pairs: exactly one succeeds [TEST-06]', async () => {
        const { a, b } = create();
        await a.add(entry('x'));
        await a.add(entry('y', 1));
        await a.add(entry('z', 2));
        const results = await Promise.all([a.claimPair(entry('x'), entry('y', 1)), b.claimPair(entry('y', 1), entry('z', 2))]);
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await a.size()).toBe(1);
    });

    test('many concurrent overlapping claims: no player is ever claimed twice [TEST-06]', async () => {
        const { a, b } = create();
        const ids = Array.from({ length: 12 }, (_, i) => `p${String(i).padStart(2, '0')}`);
        for (const [i, id] of ids.entries()) await a.add(entry(id, i));
        const attempts = [];
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) attempts.push([ids[i], ids[j]]);
        }
        const results = await Promise.all(
            attempts.map(([x, y], k) => (k % 2 ? a : b).claimPair(entry(x, ids.indexOf(x)), entry(y, ids.indexOf(y)))),
        );
        const claimed = attempts.filter((_, k) => results[k]).flat();
        expect(new Set(claimed).size).toBe(claimed.length);
        expect(claimed.length + (await a.size())).toBe(ids.length);
    });

    test('entries expire unless touched; list prunes the expired ones', async () => {
        const { a } = create({ entryTtlMs: 300 });
        await a.add(entry('kept'));
        await a.add(entry('dropped', 1));
        await sleep(150);
        expect(await a.touch(['kept', 'never-queued'])).toEqual(['kept']);
        await sleep(200);
        expect(await a.get('dropped')).toBeNull();
        expect((await a.list()).map((e) => e.user_id)).toEqual(['kept']);
        expect(await a.size()).toBe(1);
        expect(await a.claimPair(entry('kept'), entry('dropped', 1))).toBe(false);
        expect(await a.add(entry('dropped', 400))).toBe(2);
    });

    test('pairing lock: one holder; released only by its own token; expires', async () => {
        const { a, b } = create();
        expect(await a.acquirePairingLock('one', 300)).toBe(true);
        expect(await b.acquirePairingLock('two', 300)).toBe(false);
        expect(await b.releasePairingLock('two')).toBe(false);
        expect(await a.releasePairingLock('one')).toBe(true);
        expect(await a.releasePairingLock('one')).toBe(false);
        expect(await b.acquirePairingLock('two', 100)).toBe(true);
        await sleep(200);
        expect(await b.releasePairingLock('two')).toBe(false);
        expect(await a.acquirePairingLock('three', 100)).toBe(true);
    });
});
