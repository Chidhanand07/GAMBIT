// @ts-check
/**
 * Rematch and challenge requests that are waiting for an answer (NODE-10,
 * NODE-17). One Redis key per (kind, requester → target), holding the terms
 * the requester proposed, with a 60 s TTL. An accept or decline *takes* the
 * entry (read and delete in one MULTI/EXEC), so a request can be answered
 * once and only by the user it was sent to.
 *
 * Unlike the game-state repository, errors are NOT swallowed: a caller that
 * cannot read the store must refuse the accept (SEC-09).
 */

const PENDING_TTL_SECONDS = 60;
const KEY_PREFIX = 'pending';

/**
 * @typedef {'rematch' | 'challenge'} RequestKind
 * @typedef {{ kind: RequestKind, requesterId: string, targetId: string }} RequestKey
 * @typedef {Record<string, unknown>} RequestTerms
 */

/**
 * @typedef {object} PendingRedis
 * @property {(key: string, value: string, mode: 'EX', seconds: number) => Promise<unknown>} set
 * @property {() => { get: (key: string) => any, del: (key: string) => any,
 *   exec: () => Promise<Array<[Error | null, unknown]> | null> }} multi
 */

/** @param {RequestKey} key */
function redisKey({ kind, requesterId, targetId }) {
    return `${KEY_PREFIX}:${kind}:${requesterId}:${targetId}`;
}

/**
 * @param {unknown} raw
 * @returns {RequestTerms | null}
 */
function parseTerms(raw) {
    if (typeof raw !== 'string') return null;
    try {
        const terms = JSON.parse(raw);
        return terms && typeof terms === 'object' ? terms : null;
    } catch {
        return null;
    }
}

/**
 * @param {PendingRedis} redis
 */
function createPendingRequestsRepository(redis) {
    return {
        /**
         * Store (or replace) the request and restart its 60 s TTL.
         * @param {RequestKey & { terms: RequestTerms }} request
         * @returns {Promise<void>}
         */
        async put({ terms, ...key }) {
            await redis.set(redisKey(key), JSON.stringify(terms), 'EX', PENDING_TTL_SECONDS);
        },

        /**
         * Remove the request and return its terms; null when there is none
         * (never sent, already answered, or expired).
         * @param {RequestKey} key
         * @returns {Promise<RequestTerms | null>}
         */
        async take(key) {
            const k = redisKey(key);
            const results = await redis.multi().get(k).del(k).exec();
            if (!results) throw new Error('pending request transaction aborted');
            const [error, raw] = results[0];
            if (error) throw error;
            return parseTerms(raw);
        },
    };
}

module.exports = { createPendingRequestsRepository, PENDING_TTL_SECONDS };
