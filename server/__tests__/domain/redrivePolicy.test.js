/**
 * src/domain/redrivePolicy.js — backoff and give-up rule of the result outbox [ERRORS] (ADR F-066, TEST-03).
 */
const { DEFAULT_REDRIVE_POLICY, backoffMs, afterFailure } = require('../../src/domain/redrivePolicy');

const P = { baseDelayMs: 1000, maxDelayMs: 8000, maxAttempts: 5, maxAgeMs: 60_000 };

test('the pause doubles from the base delay and stops growing at the cap', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map((n) => backoffMs(n, P))).toEqual([1000, 2000, 4000, 8000, 8000, 8000, 8000]);
});

test('a failure below both limits is retried after the backoff for its attempt count', () => {
    expect(afterFailure({ attempts: 1, firstFailedAt: 0 }, 10_000, P)).toEqual({ park: false, at: 12_000 });
    expect(afterFailure({ attempts: 4, firstFailedAt: 0 }, 10_000, P)).toEqual({ park: false, at: 18_000 });
});

test('max attempts reached → park', () => {
    expect(afterFailure({ attempts: 5, firstFailedAt: 0 }, 10_000, P)).toEqual({ park: true });
});

test('first failure older than the age limit → park, even with few attempts', () => {
    expect(afterFailure({ attempts: 1, firstFailedAt: 0 }, 60_000, P)).toEqual({ park: true });
    expect(afterFailure({ attempts: 1, firstFailedAt: 0 }, 59_999, P)).toEqual({ park: false, at: 61_999 });
});

test('the defaults: 5 s first, capped at 5 min, parked after 12 re-drives or one hour', () => {
    expect(DEFAULT_REDRIVE_POLICY).toEqual({ baseDelayMs: 5000, maxDelayMs: 300_000, maxAttempts: 12, maxAgeMs: 3_600_000 });
    expect(Object.isFrozen(DEFAULT_REDRIVE_POLICY)).toBe(true);
    // Uses the defaults when no policy is passed.
    expect(afterFailure({ attempts: 12, firstFailedAt: 0 }, 1)).toEqual({ park: true });
});
