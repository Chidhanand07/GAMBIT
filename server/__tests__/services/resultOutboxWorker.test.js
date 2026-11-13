/**
 * src/services/resultOutboxWorker.js — re-drive of game results the finalizer could not write
 * [ERRORS] (ADR F-066, NODE-18). Fakes only: the outbox is the in-memory ResultOutbox that passes
 * the repository contract.
 */
const { createResultOutboxWorker } = require('../../src/services/resultOutboxWorker');
const { setErrorReporter } = require('../../src/observability/errorReporter');
const { log } = require('../../src/observability/log');
const { fakeResultOutbox } = require('./fakeResultOutbox');
const { fakeEmitter, result } = require('./fakes');

const T0 = 1_000_000;
const POLICY = { baseDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 3, maxAgeMs: 60_000 };
const ROW = { status: 'completed', result: 'white', winner_id: 'w', ended_at: '2026-11-14T00:00:00.000Z' };

function item(gameId = 'g1', overrides = {}) {
    return {
        gameId,
        row: ROW,
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

function setup() {
    const clock = { now: T0 };
    const now = () => clock.now;
    const outbox = fakeResultOutbox({ now });
    const gamesRepo = { finishIfActive: jest.fn(() => result({ id: 'g1' })) };
    const changes = { white: { new_rating: 1510 } };
    const ratingService = { processGameEnd: jest.fn(async () => changes) };
    const reviewService = { triggerGameReview: jest.fn() };
    const emitter = fakeEmitter();
    let n = 0;
    const worker = createResultOutboxWorker({
        outbox,
        gamesRepo,
        ratingService,
        reviewService,
        emitter,
        now,
        newToken: () => `tok-${++n}`,
        policy: POLICY,
    });
    return { clock, outbox, gamesRepo, ratingService, reviewService, emitter, worker, changes };
}

afterEach(() => {
    setErrorReporter(undefined);
    jest.useRealTimers();
    jest.restoreAllMocks();
});

test('a due item: the row is written through the active guard, the game reviewed and rated, the item forgotten', async () => {
    const ctx = setup();
    await ctx.outbox.enqueue(item(), T0);
    expect(await ctx.worker.runOnce()).toBe(1);

    expect(ctx.gamesRepo.finishIfActive).toHaveBeenCalledWith('g1', ROW);
    expect(ctx.reviewService.triggerGameReview).toHaveBeenCalledWith('g1', item().moveLog, '5+0');
    expect(ctx.ratingService.processGameEnd).toHaveBeenCalledWith('g1', 'w', 'b', 'white', '5+0', true);
    expect(ctx.emitter.named('rating_updated')).toEqual([{ room: 'game_g1', event: 'rating_updated', args: [ctx.changes] }]);
    expect(ctx.outbox.items.size).toBe(0);
    expect(log.info).toHaveBeenCalledWith('[outbox] game g1: result persisted on re-drive 1');
});

test('the row was already finalized (no active row): not reviewed again, rated (a no-op if already rated), forgotten', async () => {
    const ctx = setup();
    ctx.gamesRepo.finishIfActive.mockReturnValue(result(null));
    ctx.ratingService.processGameEnd.mockResolvedValue(null);
    await ctx.outbox.enqueue(item(), T0);
    await ctx.worker.runOnce();
    expect(ctx.reviewService.triggerGameReview).not.toHaveBeenCalled();
    expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
    expect(ctx.emitter.named('rating_updated')).toEqual([]);
    expect(ctx.outbox.items.size).toBe(0);
});

test('an aborted game is written and forgotten, never reviewed or rated', async () => {
    const ctx = setup();
    await ctx.outbox.enqueue(item('g1', { outcome: 'aborted', row: { status: 'aborted', result: null } }), T0);
    await ctx.worker.runOnce();
    expect(ctx.gamesRepo.finishIfActive).toHaveBeenCalledWith('g1', { status: 'aborted', result: null });
    expect(ctx.ratingService.processGameEnd).not.toHaveBeenCalled();
    expect(ctx.reviewService.triggerGameReview).not.toHaveBeenCalled();
    expect(ctx.outbox.items.size).toBe(0);
});

test('an item that is not due yet is left alone', async () => {
    const ctx = setup();
    await ctx.outbox.enqueue(item(), T0 + 5000);
    expect(await ctx.worker.runOnce()).toBe(0);
    expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
});

test('a failed write (error result or throw) is rescheduled with backoff and its attempt counted; nothing is rated', async () => {
    const ctx = setup();
    ctx.gamesRepo.finishIfActive.mockReturnValueOnce(result(null, { message: 'still down' })).mockImplementationOnce(() => {
        throw new Error('fetch failed');
    });
    await ctx.outbox.enqueue(item(), T0);
    await ctx.worker.runOnce();
    expect(await ctx.outbox.due(T0 + 1999, 10)).toEqual([]);
    expect(await ctx.outbox.due(T0 + 2000, 10)).toEqual([item('g1', { attempts: 1, lastError: 'still down' })]);
    expect(log.warn).toHaveBeenCalledWith('[outbox] game g1: re-drive 1 failed, next try in 2 s:', 'still down');

    ctx.clock.now = T0 + 2000;
    await ctx.worker.runOnce();
    expect(await ctx.outbox.due(T0 + 2000 + 4000, 10)).toEqual([item('g1', { attempts: 2, lastError: 'fetch failed' })]);
    expect(ctx.ratingService.processGameEnd).not.toHaveBeenCalled();
});

test('past max attempts the item is parked for an operator, with a fatal line naming the game and an alert', async () => {
    const ctx = setup();
    const report = jest.fn(async () => {});
    setErrorReporter({ report });
    ctx.gamesRepo.finishIfActive.mockReturnValue(result(null, { message: 'db gone' }));
    await ctx.outbox.enqueue(item('g1', { attempts: 2 }), T0);
    await ctx.worker.runOnce();

    expect(await ctx.outbox.due(Infinity, 10)).toEqual([]);
    expect(await ctx.outbox.parked()).toEqual([item('g1', { attempts: 3, lastError: 'db gone' })]);
    expect(log.fatal).toHaveBeenCalledWith(
        '[outbox] game g1: result still not persisted after 3 re-drives; parked for an operator',
        'db gone',
    );
    expect(report).toHaveBeenCalledWith(expect.any(Error), { level: 'fatal', where: 'outbox', gameId: 'g1', attempts: 3 });
    expect(report.mock.calls[0][0].message).toContain('game g1');
    // Parked items are not retried automatically.
    ctx.clock.now = T0 + 1e9;
    await ctx.worker.runOnce();
    expect(ctx.gamesRepo.finishIfActive).toHaveBeenCalledTimes(1);
});

test('an item older than the age limit is parked after its next failure, whatever its attempt count', async () => {
    const ctx = setup();
    ctx.gamesRepo.finishIfActive.mockReturnValue(result(null, { message: 'db gone' }));
    await ctx.outbox.enqueue(item('g1', { firstFailedAt: T0 - 60_000 }), T0);
    await ctx.worker.runOnce();
    expect((await ctx.outbox.parked()).map((i) => i.attempts)).toEqual([1]);
    expect(log.fatal).toHaveBeenCalledTimes(1);
});

test('when another worker holds the lock this one does nothing', async () => {
    const ctx = setup();
    await ctx.outbox.enqueue(item(), T0);
    await ctx.outbox.acquireLock('someone-else', 30_000);
    expect(await ctx.worker.runOnce()).toBe(0);
    expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
});

test('the lock is released even when a pass fails half-way (Redis error while rescheduling)', async () => {
    const ctx = setup();
    ctx.gamesRepo.finishIfActive.mockReturnValue(result(null, { message: 'db down' }));
    ctx.outbox.reschedule = jest.fn(async () => Promise.reject(new Error('redis down')));
    await ctx.outbox.enqueue(item(), T0);
    await expect(ctx.worker.runOnce()).rejects.toThrow('redis down');
    expect(await ctx.outbox.acquireLock('next', 1000)).toBe(true);
});

test('several items in one pass: each is handled on its own', async () => {
    const ctx = setup();
    ctx.gamesRepo.finishIfActive.mockImplementation((id) =>
        id === 'bad' ? result(null, { message: 'constraint' }) : result({ id }),
    );
    await ctx.outbox.enqueue(item('a'), T0);
    await ctx.outbox.enqueue(item('bad'), T0);
    await ctx.outbox.enqueue(item('c'), T0);
    expect(await ctx.worker.runOnce()).toBe(3);
    expect([...ctx.outbox.items.keys()]).toEqual(['bad']);
    expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(2);
});

test('start runs a pass every interval (an error is logged, the timer keeps going); stop ends it', async () => {
    jest.useFakeTimers();
    const ctx = setup();
    ctx.worker.runOnce = jest.fn();
    const outbox = { acquireLock: jest.fn(async () => Promise.reject(new Error('redis down'))) };
    const worker = createResultOutboxWorker({ ...ctx, outbox, intervalMs: 5000 });
    worker.start();
    worker.start(); // idempotent
    await jest.advanceTimersByTimeAsync(10_000);
    expect(outbox.acquireLock).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith('[outbox] pass failed:', 'redis down');
    worker.stop();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(outbox.acquireLock).toHaveBeenCalledTimes(2);
});
