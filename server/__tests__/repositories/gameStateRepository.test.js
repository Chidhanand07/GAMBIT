/**
 * server/src/repositories/gameStateRepository.js — factory behaviour not
 * covered through the lib/gameStore facade (see __tests__/gameStore.test.js).
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');

afterEach(() => jest.restoreAllMocks());

test('uses the injected client with the game:<id> key and a 24h TTL', async () => {
    const redis = createRedisMock();
    const setex = jest.spyOn(redis, 'setex');
    const repo = createGameStateRepository(redis);
    await repo.setGame('g1', { a: 1 });
    expect(setex).toHaveBeenCalledWith('game:g1', 86400, '{"a":1}');
});

test('concurrent updateGame calls on one game are serialised (no lost update)', async () => {
    const repo = createGameStateRepository(createRedisMock());
    await repo.setGame('g1', { a: 0, b: 0 });
    await Promise.all([repo.updateGame('g1', { a: 1 }), repo.updateGame('g1', { b: 2 })]);
    await expect(repo.getGame('g1')).resolves.toEqual({ a: 1, b: 2 });
});

describe('mutateGame: atomic read → decide → write under the per-game lock [S1][S3]', () => {
    test('writes the state the callback returns and resolves with it', async () => {
        const repo = createGameStateRepository(createRedisMock());
        await repo.setGame('g1', { ply: 0 });
        await expect(repo.mutateGame('g1', (game) => ({ ...game, ply: game.ply + 1 }))).resolves.toEqual({ ply: 1 });
        await expect(repo.getGame('g1')).resolves.toEqual({ ply: 1 });
    });

    test('a callback that returns null writes nothing', async () => {
        const redis = createRedisMock();
        const repo = createGameStateRepository(redis);
        await repo.setGame('g1', { ply: 0 });
        const setex = jest.spyOn(redis, 'setex');
        await expect(repo.mutateGame('g1', () => null)).resolves.toBeNull();
        expect(setex).not.toHaveBeenCalled();
    });

    test('the callback receives null for an unknown game', async () => {
        const repo = createGameStateRepository(createRedisMock());
        const seen = [];
        await repo.mutateGame('missing', (game) => {
            seen.push(game);
            return null;
        });
        expect(seen).toEqual([null]);
    });

    test('two concurrent mutations of one game never read the same state (no double apply)', async () => {
        const repo = createGameStateRepository(createRedisMock());
        await repo.setGame('g1', { ply: 0, status: 'active' });
        // Both callers want to make "the" move for ply 0; only the first may.
        const move = (game) => (game.ply === 0 ? { ...game, ply: 1 } : null);
        const results = await Promise.all([repo.mutateGame('g1', move), repo.mutateGame('g1', move)]);
        expect(results.filter(Boolean)).toHaveLength(1);
        await expect(repo.getGame('g1')).resolves.toEqual({ ply: 1, status: 'active' });
    });

    test('mutateGame and updateGame share the lock', async () => {
        const repo = createGameStateRepository(createRedisMock());
        await repo.setGame('g1', { a: 0, b: 0 });
        await Promise.all([repo.mutateGame('g1', (g) => ({ ...g, a: 1 })), repo.updateGame('g1', { b: 2 })]);
        await expect(repo.getGame('g1')).resolves.toEqual({ a: 1, b: 2 });
    });

    test('a throwing callback rejects and releases the lock', async () => {
        const repo = createGameStateRepository(createRedisMock());
        await repo.setGame('g1', { ply: 0 });
        await expect(
            repo.mutateGame('g1', () => {
                throw new Error('bad state');
            }),
        ).rejects.toThrow('bad state');
        await expect(repo.mutateGame('g1', (g) => ({ ...g, ply: 1 }))).resolves.toEqual({ ply: 1 });
    });
});

test('a failed update releases the lock for the next caller', async () => {
    const repo = createGameStateRepository(createRedisMock());
    await expect(repo.updateGame('missing', {})).rejects.toThrow('Game missing not found in Redis');
    await repo.setGame('missing', { a: 0 });
    await expect(repo.updateGame('missing', { a: 1 })).resolves.toEqual({ a: 1 });
});

describe('Redis failures are errors, not silent successes [ERRORS]', () => {
    const repoWith = () => {
        const redis = createRedisMock();
        return { redis, repo: createGameStateRepository(redis) };
    };

    test('setGame rejects when the write fails (it used to resolve as if stored)', async () => {
        const { redis, repo } = repoWith();
        redis._failNext('setex');
        await expect(repo.setGame('g1', { id: 'g1' })).rejects.toThrow('redis setex failed');
    });

    test('mutateGame rejects when its write fails, and the lock is released', async () => {
        const { redis, repo } = repoWith();
        await repo.setGame('g1', { id: 'g1', n: 0 });
        redis._failNext('setex');
        await expect(repo.mutateGame('g1', (g) => ({ ...g, n: 1 }))).rejects.toThrow('redis setex failed');
        expect((await repo.getGame('g1')).n).toBe(0);
        expect(await repo.mutateGame('g1', (g) => ({ ...g, n: 2 }))).toMatchObject({ n: 2 });
    });

    test('getGame rejects when Redis cannot be read: "could not look" is not "no such game"', async () => {
        const { redis, repo } = repoWith();
        redis._failNext('get');
        await expect(repo.getGame('g1')).rejects.toThrow('redis get failed');
    });

    test('a corrupt stored value is an error too', async () => {
        const { redis, repo } = repoWith();
        await redis.set('game:g1', '{oops');
        await expect(repo.getGame('g1')).rejects.toThrow();
    });

    test('the active-set calls reject on failure', async () => {
        const { redis, repo } = repoWith();
        redis._failNext('sadd');
        await expect(repo.addActiveGame('g1')).rejects.toThrow('redis sadd failed');
        redis._failNext('srem');
        await expect(repo.removeActiveGame('g1')).rejects.toThrow('redis srem failed');
        redis._failNext('smembers');
        await expect(repo.getActiveGameIds()).rejects.toThrow('redis smembers failed');
    });
});
