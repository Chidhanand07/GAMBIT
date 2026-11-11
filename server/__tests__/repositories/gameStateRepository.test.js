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

test('a failed update releases the lock for the next caller', async () => {
    const repo = createGameStateRepository(createRedisMock());
    await expect(repo.updateGame('missing', {})).rejects.toThrow('Game missing not found in Redis');
    await repo.setGame('missing', { a: 0 });
    await expect(repo.updateGame('missing', { a: 1 })).resolves.toEqual({ a: 1 });
});

test('active-set helpers log and swallow Redis errors', async () => {
    const redis = createRedisMock();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const repo = createGameStateRepository(redis);
    redis._failNext('sadd');
    await repo.addActiveGame('g1');
    redis._failNext('smembers');
    await expect(repo.getActiveGameIds()).resolves.toEqual([]);
    expect(err).toHaveBeenCalledWith('[gameStore] addActiveGame error:', 'redis sadd failed');
});
