/**
 * Shared contract for the ResultOutbox port (SOLID-04, TEST-08) [ERRORS] (ADR F-066): the Redis
 * repository on the in-memory mock AND on a real Redis (so the Lua scripts themselves run), and
 * the in-memory fake the worker tests use, must behave the same.
 *
 * Each factory returns two handles on ONE outbox (`a`, `b`): on real Redis they use two
 * connections, like two server instances.
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createGameResultOutboxRepository } = require('../../src/repositories/gameResultOutboxRepository');
const { fakeResultOutbox } = require('../services/fakeResultOutbox');
const realRedis = require('../helpers/realRedis');

const T0 = 1_767_268_800_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function item(gameId, overrides = {}) {
    return {
        gameId,
        row: { status: 'completed', result: 'white', winner_id: 'w' },
        outcome: 'white',
        whiteId: 'w',
        blackId: 'b',
        timeControl: '5+0',
        isRated: true,
        moveLog: [{ move: 'e2e4', san: 'e4' }],
        attempts: 0,
        firstFailedAt: T0,
        lastError: 'db down',
        ...overrides,
    };
}

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
        () => {
            const outbox = fakeResultOutbox();
            return { a: outbox, b: outbox };
        },
    ],
    [
        'Redis repository on the mock',
        () => {
            const redis = createRedisMock();
            return { a: createGameResultOutboxRepository(redis), b: createGameResultOutboxRepository(redis) };
        },
    ],
];
if (realRedis.available) {
    implementations.push([
        'Redis repository on real Redis (Lua)',
        () => {
            const namespace = realRedis.uniqueNamespace('outbox');
            return {
                a: createGameResultOutboxRepository(real.client(), { namespace }),
                b: createGameResultOutboxRepository(real.client(), { namespace }),
            };
        },
    ]);
}

describe.each(implementations)('result outbox contract: %s', (_name, create) => {
    test('enqueue once per game; a second enqueue keeps the first item', async () => {
        const { a, b } = create();
        expect(await a.enqueue(item('g1'), T0)).toBe(true);
        expect(await b.enqueue(item('g1', { lastError: 'other' }), T0 - 1000)).toBe(false);
        expect(await a.due(T0, 10)).toEqual([item('g1')]);
    });

    test('due: only items whose time has come, earliest first, at most `limit`', async () => {
        const { a, b } = create();
        await a.enqueue(item('late'), T0 + 5000);
        await a.enqueue(item('second'), T0 + 200);
        await a.enqueue(item('first'), T0 + 100);
        expect(await b.due(T0, 10)).toEqual([]);
        expect((await b.due(T0 + 1000, 10)).map((i) => i.gameId)).toEqual(['first', 'second']);
        expect((await b.due(T0 + 9000, 1)).map((i) => i.gameId)).toEqual(['first']);
    });

    test('reschedule stores the update and the next attempt; a removed item is not brought back', async () => {
        const { a, b } = create();
        await a.enqueue(item('g1'), T0);
        const updated = item('g1', { attempts: 1, lastError: 'still down' });
        expect(await b.reschedule(updated, T0 + 10_000)).toBe(true);
        expect(await a.due(T0 + 5000, 10)).toEqual([]);
        expect(await a.due(T0 + 10_000, 10)).toEqual([updated]);

        expect(await a.remove('g1')).toBe(true);
        expect(await b.reschedule(updated, T0)).toBe(false);
        expect(await a.due(T0 + 10_000, 10)).toEqual([]);
    });

    test('park keeps the item for an operator, out of the due set; requeue puts it back', async () => {
        const { a, b } = create();
        await a.enqueue(item('g1'), T0);
        const stuck = item('g1', { attempts: 12 });
        expect(await b.park(stuck, T0 + 1)).toBe(true);
        expect(await a.due(T0 + 1e9, 10)).toEqual([]);
        expect(await a.parked()).toEqual([stuck]);

        expect(await a.requeue('g1', T0 + 2)).toBe(true);
        expect(await b.parked()).toEqual([]);
        expect(await b.due(T0 + 2, 10)).toEqual([stuck]);
        expect(await a.requeue('unknown', T0)).toBe(false);
        expect(await a.park(item('unknown'), T0)).toBe(false);
    });

    test('remove forgets the item wherever it is', async () => {
        const { a, b } = create();
        await a.enqueue(item('due'), T0);
        await a.enqueue(item('parked'), T0);
        await a.park(item('parked'), T0);
        expect(await b.remove('due')).toBe(true);
        expect(await b.remove('parked')).toBe(true);
        expect(await b.remove('due')).toBe(false);
        expect(await a.due(T0 + 1e9, 10)).toEqual([]);
        expect(await a.parked()).toEqual([]);
        // A removed game may be queued again later.
        expect(await a.enqueue(item('due'), T0)).toBe(true);
    });

    test('the worker lock: one holder; released only by its token (compare-and-delete); expires on its own', async () => {
        const { a, b } = create();
        expect(await a.acquireLock('tok-a', 5000)).toBe(true);
        expect(await b.acquireLock('tok-b', 5000)).toBe(false);
        expect(await b.releaseLock('tok-b')).toBe(false);
        expect(await a.releaseLock('tok-a')).toBe(true);
        expect(await b.acquireLock('tok-b', 40)).toBe(true);
        await sleep(80);
        // tok-b's lock expired: someone else may take it, and tok-b can no longer release theirs.
        expect(await a.acquireLock('tok-c', 5000)).toBe(true);
        expect(await b.releaseLock('tok-b')).toBe(false);
        expect(await a.releaseLock('tok-c')).toBe(true);
    });
});
