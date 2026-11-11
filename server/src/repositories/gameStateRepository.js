// @ts-check
/**
 * Live game state in Redis: one JSON blob per game (`game:<id>`, 24 h TTL)
 * plus the `active_games` set the clock ticker walks. Moved verbatim from
 * `server/lib/gameStore.js`, which is now the singleton facade over this
 * factory (so its per-game lock map stays process-wide).
 *
 * Errors are logged and swallowed exactly as before: reads return null / [],
 * writes resolve anyway. Only `updateGame` throws (unknown game).
 */

const GAME_TTL = 86400; // 24 hours
const ACTIVE_SET = 'active_games';

/** @param {string} gameId */
function gameKey(gameId) {
    return `game:${gameId}`;
}

/**
 * @typedef {object} RedisLike
 * @property {(key: string) => Promise<string | null>} get
 * @property {(key: string, ttl: number, value: string) => Promise<unknown>} setex
 * @property {(key: string) => Promise<unknown>} del
 * @property {(key: string, member: string) => Promise<unknown>} sadd
 * @property {(key: string, member: string) => Promise<unknown>} srem
 * @property {(key: string) => Promise<string[]>} smembers
 */

/**
 * Per-game mutex (C8 fix): chains promises so concurrent `updateGame` calls
 * for the same game are serialised, preventing stale-read overwrites.
 */
function createGameLock() {
    /** @type {Map<string, Promise<void>>} */
    const locks = new Map();

    /**
     * @template T
     * @param {string} gameId
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    return async function withGameLock(gameId, fn) {
        const prev = locks.get(gameId) ?? Promise.resolve();
        /** @type {() => void} */
        let resolve = () => {};
        const next = new Promise((r) => {
            resolve = /** @type {() => void} */ (r);
        });
        locks.set(gameId, next);
        try {
            await prev;
            return await fn();
        } finally {
            resolve();
            // Only clean up if our promise is still the tail (no newer waiter)
            if (locks.get(gameId) === next) locks.delete(gameId);
        }
    };
}

/**
 * Create the Redis game-state repository.
 * @param {RedisLike} redis
 */
function createGameStateRepository(redis) {
    const withGameLock = createGameLock();

    /**
     * Read a game's state; null when missing, unreadable or Redis fails.
     * @param {string} gameId
     * @returns {Promise<any>}
     */
    async function getGame(gameId) {
        try {
            const raw = await redis.get(gameKey(gameId));
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('[gameStore] getGame error:', /** @type {Error} */ (e).message);
            return null;
        }
    }

    /**
     * Store a game's state (24 h TTL); resolves with `game` even if Redis fails.
     * @template T
     * @param {string} gameId
     * @param {T} game
     * @returns {Promise<T>}
     */
    async function setGame(gameId, game) {
        try {
            await redis.setex(gameKey(gameId), GAME_TTL, JSON.stringify(game));
        } catch (e) {
            console.error('[gameStore] setGame error:', /** @type {Error} */ (e).message);
        }
        return game;
    }

    /**
     * Merge `updates` into the stored state under the per-game lock.
     * @param {string} gameId
     * @param {object} updates
     * @returns {Promise<any>} the merged state
     * @throws {Error} when the game is not in Redis
     */
    async function updateGame(gameId, updates) {
        return withGameLock(gameId, async () => {
            const game = await getGame(gameId);
            if (!game) throw new Error(`Game ${gameId} not found in Redis`);
            const updated = { ...game, ...updates };
            await setGame(gameId, updated);
            return updated;
        });
    }

    /**
     * Delete a game's state (errors logged).
     * @param {string} gameId
     * @returns {Promise<void>}
     */
    async function deleteGame(gameId) {
        try {
            await redis.del(gameKey(gameId));
        } catch (e) {
            console.error('[gameStore] deleteGame error:', /** @type {Error} */ (e).message);
        }
    }

    /**
     * Add a game to the set the clock ticker walks (errors logged).
     * @param {string} gameId
     * @returns {Promise<void>}
     */
    async function addActiveGame(gameId) {
        try {
            await redis.sadd(ACTIVE_SET, gameId);
        } catch (e) {
            console.error('[gameStore] addActiveGame error:', /** @type {Error} */ (e).message);
        }
    }

    /**
     * Remove a game from the active set (errors logged).
     * @param {string} gameId
     * @returns {Promise<void>}
     */
    async function removeActiveGame(gameId) {
        try {
            await redis.srem(ACTIVE_SET, gameId);
        } catch (e) {
            console.error('[gameStore] removeActiveGame error:', /** @type {Error} */ (e).message);
        }
    }

    /**
     * Ids of all active games; [] when Redis fails.
     * @returns {Promise<string[]>}
     */
    async function getActiveGameIds() {
        try {
            return await redis.smembers(ACTIVE_SET);
        } catch (e) {
            console.error('[gameStore] getActiveGameIds error:', /** @type {Error} */ (e).message);
            return [];
        }
    }

    return { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame, getActiveGameIds };
}

module.exports = { createGameStateRepository };
