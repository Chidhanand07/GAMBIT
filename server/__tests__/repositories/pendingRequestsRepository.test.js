/**
 * src/repositories/pendingRequestsRepository.js — rematch / challenge requests
 * waiting for an answer [S4] (NODE-10, NODE-17).
 */
const { createRedisMock } = require('../helpers/mockRedis');
const {
    createPendingRequestsRepository,
    PENDING_TTL_SECONDS,
} = require('../../src/repositories/pendingRequestsRepository');

const T = 1_700_000_000_000;
const terms = { time_control: '5+3', is_rated: true };

let redis;
let repo;
beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T);
    redis = createRedisMock();
    repo = createPendingRequestsRepository(redis);
});
afterEach(() => jest.restoreAllMocks());

test('stores the request under requester → target with a 60 s TTL', async () => {
    const set = jest.spyOn(redis, 'set');
    await repo.put({ kind: 'rematch', requesterId: 'alice', targetId: 'bob', terms });
    expect(PENDING_TTL_SECONDS).toBe(60);
    expect(set).toHaveBeenCalledWith('pending:rematch:alice:bob', JSON.stringify(terms), 'EX', 60);
});

test('take returns the stored terms exactly once', async () => {
    await repo.put({ kind: 'rematch', requesterId: 'alice', targetId: 'bob', terms });
    expect(await repo.take({ kind: 'rematch', requesterId: 'alice', targetId: 'bob' })).toEqual(terms);
    expect(await repo.take({ kind: 'rematch', requesterId: 'alice', targetId: 'bob' })).toBeNull();
});

test.each([
    ['the direction is reversed', { kind: 'rematch', requesterId: 'bob', targetId: 'alice' }],
    ['the kind differs', { kind: 'challenge', requesterId: 'alice', targetId: 'bob' }],
    ['the target differs', { kind: 'rematch', requesterId: 'alice', targetId: 'carol' }],
])('take finds nothing when %s', async (_name, key) => {
    await repo.put({ kind: 'rematch', requesterId: 'alice', targetId: 'bob', terms });
    expect(await repo.take(key)).toBeNull();
    // ...and the real request is still there.
    expect(await repo.take({ kind: 'rematch', requesterId: 'alice', targetId: 'bob' })).toEqual(terms);
});

test('a request expires after the TTL', async () => {
    await repo.put({ kind: 'challenge', requesterId: 'alice', targetId: 'bob', terms });
    Date.now.mockReturnValue(T + PENDING_TTL_SECONDS * 1000);
    expect(await repo.take({ kind: 'challenge', requesterId: 'alice', targetId: 'bob' })).toBeNull();
});

test('a newer request replaces the older one', async () => {
    await repo.put({ kind: 'rematch', requesterId: 'alice', targetId: 'bob', terms });
    await repo.put({
        kind: 'rematch',
        requesterId: 'alice',
        targetId: 'bob',
        terms: { time_control: '1', is_rated: false },
    });
    expect(await repo.take({ kind: 'rematch', requesterId: 'alice', targetId: 'bob' })).toEqual({
        time_control: '1',
        is_rated: false,
    });
});

test('two concurrent takes: only one gets the request', async () => {
    await repo.put({ kind: 'rematch', requesterId: 'alice', targetId: 'bob', terms });
    const key = { kind: 'rematch', requesterId: 'alice', targetId: 'bob' };
    const got = await Promise.all([repo.take(key), repo.take(key)]);
    expect(got.filter(Boolean)).toEqual([terms]);
});

test('Redis failures propagate (callers fail closed)', async () => {
    redis._failNext('set');
    await expect(repo.put({ kind: 'rematch', requesterId: 'a', targetId: 'b', terms })).rejects.toThrow(
        'redis set failed',
    );
    redis._failNext('exec');
    await expect(repo.take({ kind: 'rematch', requesterId: 'a', targetId: 'b' })).rejects.toThrow('redis exec failed');
    redis._failNext('get');
    await expect(repo.take({ kind: 'rematch', requesterId: 'a', targetId: 'b' })).rejects.toThrow('redis get failed');
});

test('an unreadable entry is treated as no request', async () => {
    await redis.set('pending:rematch:alice:bob', 'not json {');
    expect(await repo.take({ kind: 'rematch', requesterId: 'alice', targetId: 'bob' })).toBeNull();
});
