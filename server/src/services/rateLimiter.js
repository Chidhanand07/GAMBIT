// @ts-check
/**
 * Rate limiting over a shared counter store (NODE-12). Used by the socket
 * middleware and the HTTP routes.
 *
 * Fail open: if the store cannot be reached the request is allowed and the
 * failure logged (docs/fixes/DECISIONS.md F-046). The game itself needs Redis,
 * so a Redis outage is already visible; the limiter must not add a second,
 * self-inflicted outage on top of it.
 */
const { decide } = require('../domain/rateLimits');

/**
 * @typedef {import('../domain/rateLimits').Rule} Rule
 * @typedef {{ hit: (key: string, windowMs: number) => Promise<{ count: number, ttlMs: number }> }} RateLimitStore
 */

/**
 * @param {{ store: RateLimitStore, rules: Readonly<Record<string, Rule>> }} deps
 */
function createRateLimiter({ store, rules }) {
    return {
        /**
         * Count a hit of `subject` against rule `ruleName`.
         * @param {string} ruleName
         * @param {string} subject a user id, an IP, or `user:event`
         * @returns {Promise<{ ok: true } | { ok: false, retryAfterMs: number }>}
         */
        async check(ruleName, subject) {
            const rule = rules[ruleName];
            if (!rule) throw new Error(`unknown rate-limit rule: ${ruleName}`);
            try {
                return decide(await store.hit(`${ruleName}:${subject}`, rule.windowMs), rule);
            } catch (e) {
                console.error(
                    `[rate-limit] store unavailable, allowing ${ruleName}:`,
                    /** @type {Error} */ (e).message,
                );
                return { ok: true };
            }
        },
    };
}

module.exports = { createRateLimiter };
