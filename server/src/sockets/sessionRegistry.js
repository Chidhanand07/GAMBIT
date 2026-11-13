// @ts-check
/**
 * In-process session bookkeeping for Socket.IO connections. User ids are the
 * ones the handshake middleware verified (NODE-10).
 *
 * A user can have several sockets (two tabs, a phone and a laptop). The
 * registry therefore records, per socket, which games that socket is "at the
 * board" of, so a disconnect can tell whether the player has really left a
 * game or has only closed one of several tabs (MULTI-SOCKET).
 *
 * Nothing here outlives its reason (G17): socket entries go when the socket
 * disconnects, game links when the game ends (`clearGame`, called by the
 * finalizer for every kind of ending) or turns out to be gone (`forgetGame`).
 *
 * Per process: with more than one server instance each instance only knows
 * its own sockets (addressed in the scaling phase).
 */

/**
 * @typedef {object} SessionRegistry
 * @property {(userId: string, socketId: string) => void} register a verified connection
 * @property {(socketId: string) => { userId: string | undefined, orphanedGames: string[] }} unregister
 *   forget a socket; `orphanedGames` are the games it was at the board of in
 *   which its user now has no socket left
 * @property {(socketId: string) => string | undefined} userIdOf
 * @property {(socketId: string, gameId: string) => void} linkSocket this socket is at the board of `gameId`
 *   (it joined the game as a player, or resumed it on connect)
 * @property {(userId: string, gameId: string) => number} socketsInGame how many of the user's sockets are at that board
 * @property {(userId: string) => string | undefined} activeGameOf the game to resume when the user connects
 * @property {(userId: string) => boolean} hasActiveGame
 * @property {(userId: string, gameId: string) => void} setActiveGame
 * @property {(gameId: string) => void} clearGame forget every link to `gameId` (the game is over)
 * @property {(userId: string, gameId: string) => void} forgetGame forget one user's resume link to `gameId`
 * @property {() => { sockets: number, users: number, gameLinks: number, activeGames: number }} stats sizes, for tests and monitoring
 */

/**
 * Add `value` to the set stored under `key`, creating the set when needed.
 * @template K, V
 * @param {Map<K, Set<V>>} map
 * @param {K} key
 * @param {V} value
 */
function addTo(map, key, value) {
    const set = map.get(key) ?? new Set();
    set.add(value);
    map.set(key, set);
}

/**
 * Remove `value` from the set under `key`, dropping the set when it empties.
 * @template K, V
 * @param {Map<K, Set<V>>} map
 * @param {K} key
 * @param {V} value
 */
function removeFrom(map, key, value) {
    const set = map.get(key);
    if (!set) return;
    set.delete(value);
    if (set.size === 0) map.delete(key);
}

/** @returns {SessionRegistry} */
function createSessionRegistry() {
    /** socketId → userId */
    /** @type {Map<string, string>} */
    const socketUsers = new Map();
    /** userId → that user's sockets */
    /** @type {Map<string, Set<string>>} */
    const userSockets = new Map();
    /** socketId → games this socket is at the board of */
    /** @type {Map<string, Set<string>>} */
    const socketGames = new Map();
    /** userId → the game to resume on (re)connect */
    /** @type {Map<string, string>} */
    const userActiveGame = new Map();

    /**
     * @param {string} userId
     * @param {string} gameId
     * @returns {number}
     */
    function socketsInGame(userId, gameId) {
        let count = 0;
        for (const socketId of userSockets.get(userId) ?? []) {
            if (socketGames.get(socketId)?.has(gameId)) count += 1;
        }
        return count;
    }

    return {
        register(userId, socketId) {
            socketUsers.set(socketId, userId);
            addTo(userSockets, userId, socketId);
        },
        unregister(socketId) {
            const userId = socketUsers.get(socketId);
            const games = [...(socketGames.get(socketId) ?? [])];
            socketUsers.delete(socketId);
            socketGames.delete(socketId);
            if (!userId) return { userId, orphanedGames: [] };
            removeFrom(userSockets, userId, socketId);
            return { userId, orphanedGames: games.filter((gameId) => socketsInGame(userId, gameId) === 0) };
        },
        userIdOf: (socketId) => socketUsers.get(socketId),
        linkSocket(socketId, gameId) {
            const userId = socketUsers.get(socketId);
            if (!userId) return;
            addTo(socketGames, socketId, gameId);
            userActiveGame.set(userId, gameId);
        },
        socketsInGame,
        activeGameOf: (userId) => userActiveGame.get(userId),
        hasActiveGame: (userId) => userActiveGame.has(userId),
        setActiveGame(userId, gameId) {
            userActiveGame.set(userId, gameId);
        },
        clearGame(gameId) {
            for (const [uid, gid] of userActiveGame.entries()) {
                if (gid === gameId) userActiveGame.delete(uid);
            }
            for (const socketId of [...socketGames.keys()]) removeFrom(socketGames, socketId, gameId);
        },
        forgetGame(userId, gameId) {
            if (userActiveGame.get(userId) === gameId) userActiveGame.delete(userId);
        },
        stats: () => ({
            sockets: socketUsers.size,
            users: userSockets.size,
            gameLinks: socketGames.size,
            activeGames: userActiveGame.size,
        }),
    };
}

module.exports = { createSessionRegistry };
