// @ts-check
/**
 * Live game state in Redis: one JSON blob per game (`game:<id>`, 24 h TTL)
 * plus the `active_games` set the clock ticker walks. Moved verbatim from
 * `server/lib/gameStore.js`, which is now the singleton facade over this
 * factory (so its per-game lock map stays process-wide).
 *
 * A Redis failure is an error (ERRORS): every call rejects when Redis cannot
 * be read or written. "Could not look" is not "no such game", and a write
 * that did not happen is not a stored state. Callers decide what a failure
 * means: socket handlers ack `internal_error`, the ticker logs and moves on.
 */

const GAME_TTL = 86400; // 24 hours
const ACTIVE_SET = 'active_games';
/** Re-reads allowed when other instances keep writing the same game. */
const MAX_CAS_ATTEMPTS = 10;
/** Base pause between compare-and-set attempts (grows with each attempt, with jitter). */
const CAS_BACKOFF_MS = 2;

/** @param {number} ms */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * @property {(key: string, expected: string, next: string, ttl: number) => Promise<unknown>} casSetGame
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
 * The `active_games` set the clock ticker walks.
 * @param {RedisLike} redis
 */
function createActiveGameSet(redis) {
    return {
        /**
         * Add a game to the set the clock ticker walks.
         * @param {string} gameId
         * @returns {Promise<void>}
         */
        async addActiveGame(gameId) {
            await redis.sadd(ACTIVE_SET, gameId);
        },
        /**
         * Remove a game from the active set.
         * @param {string} gameId
         * @returns {Promise<void>}
         */
        async removeActiveGame(gameId) {
            await redis.srem(ACTIVE_SET, gameId);
        },
        /**
         * Ids of all active games.
         * @returns {Promise<string[]>}
         */
        getActiveGameIds: () => redis.smembers(ACTIVE_SET),
    };
}

/**
 * Create the Redis game-state repository.
 * @param {RedisLike} redis
 */
function createGameStateRepository(redis) {
    const withGameLock = createGameLock();

    /**
     * Read a game's state; null when there is none.
     * @param {string} gameId
     * @returns {Promise<any>}
     * @throws when Redis cannot be read or the stored value is not JSON
     */
    async function getGame(gameId) {
        const raw = await redis.get(gameKey(gameId));
        return raw ? JSON.parse(raw) : null;
    }

    /**
     * Store a game's state (24 h TTL).
     * @template T
     * @param {string} gameId
     * @param {T} game
     * @returns {Promise<T>}
     * @throws when the write fails: the state is NOT stored
     */
    async function setGame(gameId, game) {
        await redis.setex(gameKey(gameId), GAME_TTL, JSON.stringify(game));
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
     * Atomic state transition: under the per-game lock, read the state, let
     * `mutate` decide, and write what it returns. `mutate` gets null for an
     * unknown game and returns null to leave the state untouched. Because the
     * read and the write share one lock, two callers can never both act on
     * the same state (a move applied twice, a game finalized twice).
     *
     * Across instances the write is a compare-and-set in Redis (`casSetGame`,
     * clients/redisCommands): it only succeeds if the stored state is still the
     * one `mutate` decided on; otherwise the state is re-read and `mutate` runs
     * again, at most MAX_CAS_ATTEMPTS times (NODE-17, MULTI-INSTANCE). The
     * per-process lock stays, so one instance does not race itself.
     * @template T
     * @param {string} gameId
     * @param {(game: any) => T | null | Promise<T | null>} mutate
     * @returns {Promise<T | null>} the state written, or null when nothing was
     */
    async function mutateGame(gameId, mutate) {
        return withGameLock(gameId, async () => {
            for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
                const raw = await redis.get(gameKey(gameId));
                const next = await mutate(raw ? JSON.parse(raw) : null);
                if (!next) return null;
                const written = await redis.casSetGame(gameKey(gameId), raw ?? '', JSON.stringify(next), GAME_TTL);
                if (Number(written) === 1) return next;
                // Another instance wrote in between: back off a little, then decide again on its state.
                await pause(CAS_BACKOFF_MS * (attempt + 1) * (1 + Math.random()));
            }
            throw new Error(`game ${gameId}: too much contention, gave up after ${MAX_CAS_ATTEMPTS} attempts`);
        });
    }

    /**
     * Delete a game's state.
     * @param {string} gameId
     * @returns {Promise<void>}
     */
    async function deleteGame(gameId) {
        await redis.del(gameKey(gameId));
    }

    return { getGame, setGame, updateGame, mutateGame, deleteGame, ...createActiveGameSet(redis) };
}

module.exports = { createGameStateRepository };
