/**
 * domain/rateLimits.js — the limits, in one table, and the pure decision [RATE-LIMITS] (NODE-12).
 */
const { RULES, socketRuleFor, decide } = require('../../src/domain/rateLimits');

test('every rule is a positive count over a positive window', () => {
    for (const [name, rule] of Object.entries(RULES)) {
        expect(Number.isInteger(rule.limit) && rule.limit > 0).toBe(true);
        expect(Number.isInteger(rule.windowMs) && rule.windowMs > 0).toBe(true);
        expect(name).toMatch(/^[a-z][a-zA-Z]+$/);
    }
});

test.each([
    ['make_move', 'socketMove'],
    ['send_message', 'socketChat'],
    ['join_queue', 'socketQueueJoin'],
    ['challenge_request', 'socketChallenge'],
    ['rematch_request', 'socketChallenge'],
    ['resign', 'socketEvent'],
    ['join_game', 'socketEvent'],
    ['anything_else', 'socketEvent'],
])('socket event %s is limited by rule %s', (event, rule) => {
    expect(socketRuleFor(event)).toBe(rule);
});

describe('decide', () => {
    const rule = { limit: 3, windowMs: 10_000 };
    test('up to the limit is allowed', () => {
        expect(decide({ count: 1, ttlMs: 9_000 }, rule)).toEqual({ ok: true });
        expect(decide({ count: 3, ttlMs: 1 }, rule)).toEqual({ ok: true });
    });
    test('over the limit: refused, retry when the window ends', () => {
        expect(decide({ count: 4, ttlMs: 2_500 }, rule)).toEqual({ ok: false, retryAfterMs: 2_500 });
    });
    test('a window without a usable TTL never means "forever": retry after one window', () => {
        expect(decide({ count: 9, ttlMs: -1 }, rule)).toEqual({ ok: false, retryAfterMs: 10_000 });
    });
});
