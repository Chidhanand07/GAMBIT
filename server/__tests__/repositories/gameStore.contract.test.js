/**
 * Shared contract for the game-store port (SOLID-04, TEST-08): the Redis
 * repository and the in-memory fake the service tests use must behave the
 * same for the calls services make, so a service test proves something about
 * production.
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');
const { fakeGameStore } = require('../services/fakes');

describe.each([
    ['Redis repository', () => createGameStateRepository(createRedisMock())],
    ['fakeGameStore', () => fakeGameStore()],
])('game store contract: %s', (_name, create) => {
    let store;
    beforeEach(() => {
        store = create();
    });

    test('getGame: null for an unknown game, the stored state otherwise', async () => {
        expect(await store.getGame('missing')).toBeNull();
        await store.setGame('g', { id: 'g', ply: 0 });
        expect(await store.getGame('g')).toEqual({ id: 'g', ply: 0 });
    });

    test('getGame returns a copy: mutating it does not change the store', async () => {
        await store.setGame('g', { id: 'g', log: [] });
        (await store.getGame('g')).log.push('x');
        expect(await store.getGame('g')).toEqual({ id: 'g', log: [] });
    });

    test('mutateGame: the callback sees the state (null when unknown)', async () => {
        const seen = [];
        await store.mutateGame('missing', (game) => (seen.push(game), null));
        await store.setGame('g', { ply: 0 });
        await store.mutateGame('g', (game) => (seen.push(game), null));
        expect(seen).toEqual([null, { ply: 0 }]);
    });

    test('mutateGame: a returned state is written and returned; null writes nothing and returns null', async () => {
        await store.setGame('g', { ply: 0 });
        expect(await store.mutateGame('g', (game) => ({ ...game, ply: 1 }))).toEqual({ ply: 1 });
        expect(await store.getGame('g')).toEqual({ ply: 1 });
        expect(await store.mutateGame('g', () => null)).toBeNull();
        expect(await store.getGame('g')).toEqual({ ply: 1 });
    });

    test('mutateGame: an async callback is awaited', async () => {
        await store.setGame('g', { ply: 0 });
        await store.mutateGame('g', async (game) => ({ ...game, ply: 5 }));
        expect(await store.getGame('g')).toEqual({ ply: 5 });
    });

    test('mutateGame: a throwing callback rejects and leaves the state alone', async () => {
        await store.setGame('g', { ply: 0 });
        await expect(
            store.mutateGame('g', () => {
                throw new Error('nope');
            }),
        ).rejects.toThrow('nope');
        expect(await store.getGame('g')).toEqual({ ply: 0 });
    });

    test('active set: add, list, remove', async () => {
        await store.addActiveGame('g1');
        await store.addActiveGame('g2');
        expect((await store.getActiveGameIds()).sort()).toEqual(['g1', 'g2']);
        await store.removeActiveGame('g1');
        expect(await store.getActiveGameIds()).toEqual(['g2']);
    });
});

describe('mutateGame is a compare-and-set against Redis, not only an in-process lock [MULTI-INSTANCE]', () => {
    const { createRedisMock } = require('../helpers/mockRedis');
    const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');

    test('a write by another instance between our read and our write makes us retry on the new state', async () => {
        const redis = createRedisMock();
        const store = createGameStateRepository(redis);
        const otherInstance = createGameStateRepository(redis);
        await store.setGame('g', { n: 0 });

        let first = true;
        const result = await store.mutateGame('g', async (game) => {
            if (first) {
                first = false;
                // Another instance commits while we are deciding.
                await otherInstance.mutateGame('g', (g) => ({ ...g, n: g.n + 10 }));
            }
            return { ...game, n: game.n + 1 };
        });
        expect(result).toEqual({ n: 11 });
        expect(await store.getGame('g')).toEqual({ n: 11 });
    });

    test('a key that keeps changing is given up on after a bounded number of attempts', async () => {
        const redis = createRedisMock();
        const store = createGameStateRepository(redis);
        const other = createGameStateRepository(redis);
        await store.setGame('g', { n: 0 });
        await expect(
            store.mutateGame('g', async (game) => {
                await other.setGame('g', { n: Math.random() });
                return { ...game, n: -1 };
            }),
        ).rejects.toThrow('game g: too much contention');
    });
});
