/**
 * The spectators repository on the in-memory Redis mock AND on a real Redis, so the Lua
 * scripts themselves run (SOLID-04, NODE-17) [F-130]. Two handles = two instances.
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createSpectatorsRepository } = require('../../src/repositories/spectatorsRepository');
const realRedis = require('../helpers/realRedis');

const T0 = 1_767_268_800_000;
const TTL = 60_000;

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
        'Redis mock',
        () => {
            const redis = createRedisMock();
            const repo = createSpectatorsRepository(redis, { ttlMs: TTL });
            return { a: repo, b: repo };
        },
    ],
    ...(realRedis.available
        ? [
              [
                  'real Redis',
                  () => {
                      const namespace = realRedis.uniqueNamespace('spec');
                      return {
                          a: createSpectatorsRepository(real.client(), { namespace, ttlMs: TTL }),
                          b: createSpectatorsRepository(real.client(), { namespace, ttlMs: TTL }),
                      };
                  },
              ],
          ]
        : []),
];

describe.each(implementations)('spectators repository on %s', (_name, make) => {
    test('add is shared by every instance; a re-add of the same member changes nothing', async () => {
        const { a, b } = make();
        expect(await a.add({ gameId: 'g', member: 'u1:s1', now: T0 })).toEqual({ changed: true, members: ['u1:s1'] });
        const second = await b.add({ gameId: 'g', member: 'u2:s2', now: T0 + 1 });
        expect(second.changed).toBe(true);
        expect([...second.members].sort()).toEqual(['u1:s1', 'u2:s2']);
        expect((await a.add({ gameId: 'g', member: 'u1:s1', now: T0 + 2 })).changed).toBe(false);
        expect(await a.games()).toEqual(['g']);
    });

    test('remove drops the member; the last one out takes the game off the list', async () => {
        const { a, b } = make();
        await a.add({ gameId: 'g', member: 'u1:s1', now: T0 });
        await b.add({ gameId: 'g', member: 'u2:s2', now: T0 });
        expect(await b.remove({ gameId: 'g', member: 'u1:s1', now: T0 + 1 })).toEqual({
            changed: true,
            members: ['u2:s2'],
        });
        expect(await a.remove({ gameId: 'g', member: 'u1:s1', now: T0 + 2 })).toEqual({
            changed: false,
            members: ['u2:s2'],
        });
        expect((await a.remove({ gameId: 'g', member: 'u2:s2', now: T0 + 3 })).members).toEqual([]);
        expect(await a.games()).toEqual([]);
    });

    test('a member that is not refreshed lapses after the TTL and is pruned (crashed instance)', async () => {
        const { a, b } = make();
        await a.add({ gameId: 'g', member: 'dead:s1', now: T0 });
        await b.add({ gameId: 'g', member: 'live:s2', now: T0 });
        expect(await b.refresh({ gameId: 'g', member: 'live:s2', now: T0 + TTL - 1 })).toBe(true);
        expect(await b.prune('g', T0 + TTL - 1)).toEqual({ changed: false, members: ['dead:s1', 'live:s2'] });
        expect(await b.prune('g', T0 + TTL)).toEqual({ changed: true, members: ['live:s2'] });
        expect(await b.prune('g', T0 + TTL + 1)).toEqual({ changed: false, members: ['live:s2'] });
    });

    test('refresh never brings back a member that left or lapsed', async () => {
        const { a } = make();
        expect(await a.refresh({ gameId: 'g', member: 'u1:s1', now: T0 })).toBe(false);
        await a.add({ gameId: 'g', member: 'u1:s1', now: T0 });
        await a.remove({ gameId: 'g', member: 'u1:s1', now: T0 + 1 });
        expect(await a.refresh({ gameId: 'g', member: 'u1:s1', now: T0 + 2 })).toBe(false);
        expect((await a.prune('g', T0 + 3)).members).toEqual([]);
    });

    test('games are independent', async () => {
        const { a } = make();
        await a.add({ gameId: 'g1', member: 'u1:s1', now: T0 });
        await a.add({ gameId: 'g2', member: 'u1:s1', now: T0 });
        await a.remove({ gameId: 'g1', member: 'u1:s1', now: T0 });
        expect((await a.prune('g2', T0)).members).toEqual(['u1:s1']);
        expect(await a.games()).toEqual(['g2']);
    });
});
