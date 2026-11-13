/**
 * Two server instances re-driving one result outbox over one real Redis [ERRORS] (ADR F-066,
 * TEST-06, NODE-18): a stuck game result is written, reviewed and rated once, whichever worker
 * gets it. Skips when no Redis is available (CI provides one).
 */
const Redis = require('ioredis');
const { createGameResultOutboxRepository } = require('../../src/repositories/gameResultOutboxRepository');
const { createResultOutboxWorker } = require('../../src/services/resultOutboxWorker');
const realRedis = require('../helpers/realRedis');
const { fakeEmitter } = require('../services/fakes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();

let server = null;
const connections = [];
beforeAll(async () => {
    server = await realRedis.startRealRedis();
});
afterAll(async () => {
    await Promise.all(connections.map((c) => c.quit().catch(() => c.disconnect())));
    await server?.stop();
});

/**
 * The database side, shared by both instances: `finishIfActive` changes the row only while it is
 * active (like `.eq('status', 'active')`); the rating applies once per game (rated_at). With
 * `holdUntil: n`, every write waits until n writes are in flight, so the race is forced, not timed.
 */
function fakeDatabase({ holdUntil = 1 } = {}) {
    const rows = new Map([['g1', 'active']]);
    const rated = new Set();
    let inFlight = 0;
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    return {
        rows,
        gamesRepo: {
            finishIfActive: jest.fn(async (gameId, row) => {
                inFlight += 1;
                if (inFlight >= holdUntil) open();
                await Promise.race([gate, sleep(2000)]);
                await sleep(10);
                if (rows.get(gameId) !== 'active') return { data: null, error: null };
                rows.set(gameId, row.status);
                return { data: { id: gameId }, error: null };
            }),
        },
        ratingService: {
            processGameEnd: jest.fn(async (gameId) => {
                if (rated.has(gameId)) return null; // 'already_applied'
                rated.add(gameId);
                return { white: {}, black: {} };
            }),
        },
    };
}

/** One server instance: its own Redis connection, repository and worker. */
function instance(namespace, db, workerOptions = {}) {
    const redis = new Redis(server.url, { maxRetriesPerRequest: 1 });
    connections.push(redis);
    const outbox = createGameResultOutboxRepository(redis, { namespace });
    const reviewService = { triggerGameReview: jest.fn() };
    const emitter = fakeEmitter();
    const worker = createResultOutboxWorker({
        outbox,
        gamesRepo: db.gamesRepo,
        ratingService: db.ratingService,
        reviewService,
        emitter,
        ...workerOptions,
    });
    return { outbox, worker, reviewService, emitter };
}

const stuckItem = () => ({
    gameId: 'g1',
    row: { status: 'completed', result: 'white', winner_id: 'w' },
    outcome: 'white',
    whiteId: 'w',
    blackId: 'b',
    timeControl: '5+0',
    isRated: true,
    moveLog: [],
    attempts: 0,
    firstFailedAt: T0,
    lastError: 'db down',
});

const maybe = realRedis.available ? test : test.skip;

maybe('two workers racing over one Redis: the stuck result is re-driven exactly once', async () => {
    const namespace = realRedis.uniqueNamespace('outbox2');
    const db = fakeDatabase();
    const a = instance(namespace, db);
    const b = instance(namespace, db);
    expect(await a.outbox.enqueue(stuckItem(), T0)).toBe(true);

    for (let round = 0; round < 5; round++) await Promise.all([a.worker.runOnce(), b.worker.runOnce()]);

    expect(db.gamesRepo.finishIfActive).toHaveBeenCalledTimes(1);
    expect(db.rows.get('g1')).toBe('completed');
    expect(db.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
    expect(a.reviewService.triggerGameReview.mock.calls.length + b.reviewService.triggerGameReview.mock.calls.length).toBe(1);
    expect([...a.emitter.named('rating_updated'), ...b.emitter.named('rating_updated')]).toHaveLength(1);
    expect(await a.outbox.due(Number.MAX_SAFE_INTEGER, 10)).toEqual([]);
    expect(await b.outbox.parked()).toEqual([]);
});

maybe('even with the lock lapsing mid-pass, the row is finished once and reviewed once; the rating stays single', async () => {
    const namespace = realRedis.uniqueNamespace('outbox2');
    const db = fakeDatabase({ holdUntil: 2 });
    // 1 ms lock: both workers get it and both take the item (the guards, not the lock, must hold).
    const a = instance(namespace, db, { lockTtlMs: 1 });
    const b = instance(namespace, db, { lockTtlMs: 1 });
    await a.outbox.enqueue(stuckItem(), T0);
    await Promise.all([a.worker.runOnce(), sleep(5).then(() => b.worker.runOnce())]);

    expect(db.gamesRepo.finishIfActive).toHaveBeenCalledTimes(2);
    expect(a.reviewService.triggerGameReview.mock.calls.length + b.reviewService.triggerGameReview.mock.calls.length).toBe(1);
    // Rated once; the second call is the database's "already applied".
    expect(await Promise.all(db.ratingService.processGameEnd.mock.results.map((r) => r.value))).toEqual([
        { white: {}, black: {} },
        null,
    ]);
    expect(await a.outbox.due(Number.MAX_SAFE_INTEGER, 10)).toEqual([]);
});

if (!realRedis.available) test.skip(`real Redis — ${realRedis.SKIP_REASON}`, () => {});
