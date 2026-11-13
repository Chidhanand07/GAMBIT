// @ts-check
/**
 * When to try a game result again that could not be written to the database
 * (the result outbox, ERRORS / ADR F-066), and when to stop and hand it to an
 * operator. Pure: the caller passes the time (TEST-03).
 *
 * Backoff doubles from `baseDelayMs` up to `maxDelayMs`. An item is parked
 * (kept, no more automatic tries, alert raised) after `maxAttempts` failed
 * re-drives or once its first failure is `maxAgeMs` old, whichever comes
 * first. With the defaults: 5 s, 10 s, 20 s ... 5 min, parked after 12 tries
 * (about 35 minutes after the first failure) or after one hour.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * @typedef {{ baseDelayMs: number, maxDelayMs: number, maxAttempts: number, maxAgeMs: number }} RedrivePolicy
 */

/** @type {Readonly<RedrivePolicy>} */
const DEFAULT_REDRIVE_POLICY = Object.freeze({
    baseDelayMs: 5 * SECOND_MS,
    maxDelayMs: 5 * MINUTE_MS,
    maxAttempts: 12,
    maxAgeMs: 60 * MINUTE_MS,
});

/**
 * The pause before re-drive number `attempts + 1`.
 * @param {number} attempts failed re-drives so far (0 for a freshly queued item)
 * @param {RedrivePolicy} policy
 */
function backoffMs(attempts, policy) {
    return Math.min(policy.baseDelayMs * 2 ** Math.max(0, attempts), policy.maxDelayMs);
}

/**
 * What to do after a failed re-drive.
 * @param {{ attempts: number, firstFailedAt: number }} item `attempts` already counts this failure
 * @param {number} now
 * @param {RedrivePolicy} [policy]
 * @returns {{ park: true } | { park: false, at: number }}
 */
function afterFailure({ attempts, firstFailedAt }, now, policy = DEFAULT_REDRIVE_POLICY) {
    if (attempts >= policy.maxAttempts || now - firstFailedAt >= policy.maxAgeMs) return { park: true };
    return { park: false, at: now + backoffMs(attempts, policy) };
}

module.exports = { DEFAULT_REDRIVE_POLICY, backoffMs, afterFailure };
