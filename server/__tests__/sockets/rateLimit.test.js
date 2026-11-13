/**
 * src/sockets/rateLimit.js — per user and per event type, before the handler runs [RATE-LIMITS].
 */
const { createSocketRateLimit } = require('../../src/sockets/rateLimit');

function setup(result) {
    const limiter = { check: jest.fn(async () => result) };
    const socket = { data: { userId: 'u1' } };
    return { limiter, middleware: createSocketRateLimit({ limiter })(socket) };
}

const run = (middleware, packet) => new Promise((resolve) => middleware(packet, (err) => resolve(err ?? 'next')));

test('an allowed event reaches its handler; the rule and subject are per user and per event type', async () => {
    const { limiter, middleware } = setup({ ok: true });
    expect(await run(middleware, ['make_move', { game_id: 'g' }, jest.fn()])).toBe('next');
    expect(limiter.check).toHaveBeenCalledWith('socketMove', 'u1:make_move');
});

test('a limited event never reaches its handler; the ack says rate_limited with a retry hint', async () => {
    const { middleware } = setup({ ok: false, retryAfterMs: 1500 });
    const ack = jest.fn();
    const outcome = await Promise.race([run(middleware, ['send_message', { text: 'x' }, ack]), new Promise((r) => setTimeout(() => r('held'), 20))]);
    expect(outcome).toBe('held');
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'rate_limited', retryAfterMs: 1500 });
});

test('a limited event without an ack is dropped silently', async () => {
    const { middleware } = setup({ ok: false, retryAfterMs: 10 });
    const outcome = await Promise.race([run(middleware, ['join_queue', {}]), new Promise((r) => setTimeout(() => r('held'), 20))]);
    expect(outcome).toBe('held');
});
