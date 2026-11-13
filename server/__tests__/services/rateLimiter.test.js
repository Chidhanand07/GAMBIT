/**
 * src/services/rateLimiter.js over the Redis repository [RATE-LIMITS] (NODE-12, NODE-17).
 * Shared across instances because the counters live in Redis.
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createRateLimitRepository } = require('../../src/repositories/rateLimitRepository');
const { createRateLimiter } = require('../../src/services/rateLimiter');
const { log } = require('../../src/observability/log');

const RULES = { tight: { limit: 2, windowMs: 1000 } };

function setup() {
    const redis = createRedisMock();
    const limiter = createRateLimiter({ store: createRateLimitRepository(redis), rules: RULES });
    return { redis, limiter };
}

beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

test('the limit applies per subject within the window, then resets', async () => {
    const { limiter } = setup();
    expect(await limiter.check('tight', 'u1')).toEqual({ ok: true });
    expect(await limiter.check('tight', 'u1')).toEqual({ ok: true });
    expect(await limiter.check('tight', 'u1')).toEqual({ ok: false, retryAfterMs: 1000 });
    expect(await limiter.check('tight', 'u2')).toEqual({ ok: true });

    jest.advanceTimersByTime(1000);
    expect(await limiter.check('tight', 'u1')).toEqual({ ok: true });
});

test('two server instances share the counter (it lives in Redis)', async () => {
    const redis = createRedisMock();
    const a = createRateLimiter({ store: createRateLimitRepository(redis), rules: RULES });
    const b = createRateLimiter({ store: createRateLimitRepository(redis), rules: RULES });
    await a.check('tight', 'u1');
    await b.check('tight', 'u1');
    expect(await a.check('tight', 'u1')).toMatchObject({ ok: false });
});

test('the counter key expires with the window (no unbounded keys)', async () => {
    const { redis, limiter } = setup();
    await limiter.check('tight', 'u1');
    expect([...redis._strings.keys()]).toEqual(['ratelimit:tight:u1']);
    jest.advanceTimersByTime(1000);
    await redis.get('ratelimit:tight:u1');
    expect(redis._strings.size).toBe(0);
});

test('Redis failing → allowed and logged (fail open, ADR F-046)', async () => {
    const err = log.error;
    const { redis, limiter } = setup();
    redis._failNext('exec');
    expect(await limiter.check('tight', 'u1')).toEqual({ ok: true });
    expect(err).toHaveBeenCalledWith('[rate-limit] store unavailable, allowing tight:', 'redis exec failed');
});

test('an unknown rule is a programming error', async () => {
    const { limiter } = setup();
    await expect(limiter.check('nope', 'u1')).rejects.toThrow('unknown rate-limit rule: nope');
});
