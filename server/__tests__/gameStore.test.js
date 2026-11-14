/**
 * server/lib/gameStore.js — Redis-backed live game state.
 */
jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());

const redis = require('../lib/redis');
const store = require('../lib/gameStore');
const { makeGame } = require('./helpers/fixtures');

beforeEach(() => {
    redis._reset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('setGame then getGame round-trips the state', async () => {
    const game = makeGame();
    await expect(store.setGame('game-1', game)).resolves.toEqual(game);
    await expect(store.getGame('game-1')).resolves.toEqual(game);
    expect(redis._strings.has('game:game-1')).toBe(true);
});

test('getGame returns null for an unknown game', async () => {
    await expect(store.getGame('missing')).resolves.toBeNull();
});

test('getGame rejects when Redis fails or data is corrupt: "could not look" is not "no game" [ERRORS]', async () => {
    redis._failNext('get');
    await expect(store.getGame('game-1')).rejects.toThrow();

    await redis.set('game:bad', '{not json');
    await expect(store.getGame('bad')).rejects.toThrow();
});

test('setGame rejects when the write fails (it used to resolve as if stored) [ERRORS]', async () => {
    redis._failNext('setex');
    await expect(store.setGame('game-1', makeGame())).rejects.toThrow();
});

test('updateGame merges fields into the stored state', async () => {
    await store.setGame('game-1', makeGame());
    const updated = await store.updateGame('game-1', { fen: 'x', activeSide: 'b' });
    expect(updated).toMatchObject({ fen: 'x', activeSide: 'b', whiteId: 'white-user' });
    await expect(store.getGame('game-1')).resolves.toMatchObject({ fen: 'x' });
});

test('updateGame throws for an unknown game', async () => {
    await expect(store.updateGame('missing', {})).rejects.toThrow('not found');
});

test('concurrent updateGame calls on one game are serialized (no lost writes)', async () => {
    await store.setGame('game-1', makeGame({ moveLog: [] }));
    // Each update reads the whole state then writes it back; without the lock,
    // parallel updates would each start from the original state and drop the others' keys.
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
        store.updateGame('game-1', { [`k${i}`]: i })
    ));
    const final = await store.getGame('game-1');
    for (let i = 0; i < 20; i++) expect(final[`k${i}`]).toBe(i);
});

test('a failing update does not block later updates on the same game', async () => {
    await expect(store.updateGame('ghost', {})).rejects.toThrow();
    await store.setGame('ghost', makeGame({ id: 'ghost' }));
    await expect(store.updateGame('ghost', { fen: 'y' })).resolves.toMatchObject({ fen: 'y' });
});

test('deleteGame removes the state', async () => {
    await store.setGame('game-1', makeGame());
    await store.deleteGame('game-1');
    await expect(store.getGame('game-1')).resolves.toBeNull();
});

test('active game set: add, list, remove', async () => {
    await store.addActiveGame('a');
    await store.addActiveGame('b');
    await store.addActiveGame('a');
    expect((await store.getActiveGameIds()).sort()).toEqual(['a', 'b']);
    await store.removeActiveGame('a');
    expect(await store.getActiveGameIds()).toEqual(['b']);
});

test('getActiveGameIds rejects when Redis fails (the ticker logs it and tries again next second) [ERRORS]', async () => {
    redis._failNext('smembers');
    await expect(store.getActiveGameIds()).rejects.toThrow();
});
