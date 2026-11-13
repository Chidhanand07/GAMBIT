/**
 * Two server instances sharing one Redis [MULTI-INSTANCE] (NODE-17, NODE-18, TEST-06).
 * Each "instance" has its own repository object (so its own in-process lock), as two Node
 * processes would; only Redis is shared. Runs against a real Redis when one is available.
 */
const Redis = require('ioredis');
const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');
const { createTickLockRepository } = require('../../src/repositories/tickLockRepository');
const { defineRedisCommands } = require('../../src/clients/redisCommands');
const { startRealRedis } = require('../helpers/realRedis');

let redisServer;
const clients = [];

beforeAll(async () => {
    redisServer = await startRealRedis();
});
afterAll(async () => {
    for (const c of clients) c.disconnect();
    await redisServer?.stop();
});

function instance() {
    const redis = defineRedisCommands(new Redis(redisServer.url, { maxRetriesPerRequest: 1 }));
    clients.push(redis);
    return { redis, store: createGameStateRepository(redis), ticks: createTickLockRepository(redis) };
}

const maybe = (name, fn) => test(name, async () => {
    if (!redisServer) {
        console.warn(`skipped (no redis-server binary and no REDIS_TEST_URL): ${name}`);
        return;
    }
    await fn();
});

maybe('two instances applying a move to the same game at once: exactly one wins, nothing is lost', async () => {
    const a = instance();
    const b = instance();
    await a.store.setGame('g', { id: 'g', ply: 0, moves: [] });

    // Both instances read ply 0 and want to append "their" move.
    const play = (inst, move) =>
        inst.store.mutateGame('g', (game) => (game.ply === 0 ? { ...game, ply: 1, moves: [move] } : null));
    const [ra, rb] = await Promise.all([play(a, 'e4'), play(b, 'd4')]);

    const applied = [ra, rb].filter(Boolean);
    expect(applied).toHaveLength(1);
    const final = await a.store.getGame('g');
    expect(final.ply).toBe(1);
    expect(final.moves).toEqual(applied[0].moves);
});

maybe('many concurrent increments from two instances are all applied (no lost update)', async () => {
    const a = instance();
    const b = instance();
    await a.store.setGame('c', { n: 0 });
    const bump = (inst) => inst.store.mutateGame('c', (game) => ({ ...game, n: game.n + 1 }));
    await Promise.all(Array.from({ length: 40 }, (_, i) => bump(i % 2 ? a : b)));
    expect((await a.store.getGame('c')).n).toBe(40);
});

maybe('finalizing on two instances at once: exactly one active → completed transition', async () => {
    const a = instance();
    const b = instance();
    await a.store.setGame('f', { status: 'active' });
    const finish = (inst, by) =>
        inst.store.mutateGame('f', (game) => (game.status === 'active' ? { status: 'completed', by } : null));
    const results = await Promise.all([finish(a, 'A'), finish(b, 'B'), finish(a, 'A2'), finish(b, 'B2')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await a.store.getGame('f')).status).toBe('completed');
});

maybe('the clock tick of one game runs on one instance per tick', async () => {
    const a = instance();
    const b = instance();
    const wins = await Promise.all([a.ticks.tryAcquire('g', 1000), b.ticks.tryAcquire('g', 1000), a.ticks.tryAcquire('g', 1000)]);
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await b.ticks.tryAcquire('other-game', 1000)).toBe(true);
});
