// @ts-check
/**
 * Rate limits (NODE-12): one table of named rules and the pure decision.
 * Fixed windows: at most `limit` hits per `windowMs` per subject.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * @typedef {{ limit: number, windowMs: number }} Rule
 */

/** Every limit the game server applies. Numbers are per subject (user or IP). */
const RULES = Object.freeze({
    /** A move per 100 ms on average is far beyond human bullet play, premoves included. */
    socketMove: { limit: 20, windowMs: 2 * SECOND },
    /** Chat: a burst of five lines, then wait. */
    socketChat: { limit: 5, windowMs: 10 * SECOND },
    /** Joining the queue: a few retries a minute are normal; dozens are not. */
    socketQueueJoin: { limit: 10, windowMs: MINUTE },
    /** Challenges and rematch requests notify another person: kept low. */
    socketChallenge: { limit: 10, windowMs: MINUTE },
    /** Any other socket event (join, resign, accepts, …). */
    socketEvent: { limit: 60, windowMs: 10 * SECOND },
    /** HTTP: the engine proxy costs CPU on the engine. */
    httpAnalysis: { limit: 20, windowMs: MINUTE },
    /** HTTP: the signup form checks as the user types (debounced). */
    httpUsernameCheck: { limit: 60, windowMs: MINUTE },
    /** HTTP: invite look-ups and joins (a token guessing guard). */
    httpInvite: { limit: 30, windowMs: MINUTE },
});

/** Socket events with their own rule; every other event uses `socketEvent`. */
const SOCKET_EVENT_RULES = Object.freeze({
    make_move: 'socketMove',
    send_message: 'socketChat',
    join_queue: 'socketQueueJoin',
    challenge_request: 'socketChallenge',
    rematch_request: 'socketChallenge',
});

/** HTTP route prefixes with a rule; routes not listed are not limited here. */
const HTTP_PATH_RULES = Object.freeze([
    ['/api/analysis/engine', 'httpAnalysis'],
    ['/api/users/check-username', 'httpUsernameCheck'],
    ['/api/games/join/', 'httpInvite'],
]);

/**
 * @param {string} path
 * @returns {keyof typeof RULES | null}
 */
function httpRuleFor(path) {
    const match = HTTP_PATH_RULES.find(([prefix]) => path.startsWith(prefix));
    return match ? /** @type {keyof typeof RULES} */ (match[1]) : null;
}

/**
 * @param {string} event
 * @returns {keyof typeof RULES}
 */
function socketRuleFor(event) {
    return /** @type {keyof typeof RULES} */ (
        SOCKET_EVENT_RULES[/** @type {keyof typeof SOCKET_EVENT_RULES} */ (event)] ?? 'socketEvent'
    );
}

/**
 * Whether a hit that brought the window's count to `count` is allowed.
 * @param {{ count: number, ttlMs: number }} window `ttlMs` is what is left of the window
 * @param {Rule} rule
 * @returns {{ ok: true } | { ok: false, retryAfterMs: number }}
 */
function decide({ count, ttlMs }, rule) {
    if (count <= rule.limit) return { ok: true };
    // A window without a TTL should not exist; never let it mean "blocked forever".
    return { ok: false, retryAfterMs: ttlMs > 0 ? ttlMs : rule.windowMs };
}

module.exports = { RULES, socketRuleFor, httpRuleFor, decide };
