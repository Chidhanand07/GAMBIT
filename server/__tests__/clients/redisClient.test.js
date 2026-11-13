/**
 * server/src/clients/redisClient.js — same ioredis options and log lines.
 */
const handlers = {};
const instances = [];
jest.mock('ioredis', () =>
    jest.fn().mockImplementation(function FakeRedis(url, options) {
        this.url = url;
        this.options = options;
        this.on = jest.fn((event, fn) => {
            handlers[event] = fn;
            return this;
        });
        instances.push(this);
    }),
);

const { createRedisClient } = require('../../src/clients/redisClient');
const { log } = require('../../src/observability/log');

afterEach(() => jest.restoreAllMocks());

test('passes the URL and the original options', () => {
    const redis = createRedisClient('redis://h:1');
    expect(redis.url).toBe('redis://h:1');
    expect(redis.options).toMatchObject({ lazyConnect: true, maxRetriesPerRequest: 2 });
});

test('retryStrategy backs off 200ms per attempt, capped at 2000, gives up after 3', () => {
    const errSpy = jest.spyOn(log, 'error');
    const { retryStrategy } = createRedisClient('redis://h:1').options;
    expect([1, 2, 3].map(retryStrategy)).toEqual([200, 400, 600]);
    expect(retryStrategy(4)).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
        '[Redis] Connection failed after 3 retries — game state will use Supabase fallback',
    );
});

test('logs connect and error events', () => {
    const logSpy = jest.spyOn(log, 'info');
    const errSpy = jest.spyOn(log, 'error');
    createRedisClient('redis://h:1');
    handlers.connect();
    handlers.error(new Error('boom'));
    expect(logSpy).toHaveBeenCalledWith('[Redis] Connected');
    expect(errSpy).toHaveBeenCalledWith('[Redis] Error:', 'boom');
});
