// @ts-check
/**
 * In-process session bookkeeping for Socket.IO connections (moved from the
 * three maps at the top of `server.js`). Identity is whatever the client sent
 * in `authenticate` (known bug, preserved; see NODE-10).
 *
 * `userActiveGame` is never cleaned on disconnect (known unbounded growth, preserved).
 */

/**
 * @typedef {object} SessionRegistry
 * @property {(userId: string, socketId: string) => void} register `authenticate`
 * @property {(socketId: string) => string | undefined} unregister forget a socket; returns its user id
 * @property {(socketId: string) => string | undefined} userIdOf
 * @property {(userId: string) => string | undefined} activeGameOf
 * @property {(userId: string) => boolean} hasActiveGame
 * @property {(userId: string, gameId: string) => void} setActiveGame
 * @property {(gameId: string) => void} clearGame forget every user's link to `gameId`
 */

/** @returns {SessionRegistry} */
function createSessionRegistry() {
    // Track authenticated userId → current socketId for reconnect support
    /** @type {Map<string, string>} */
    const userSockets = new Map();
    // socketId → userId (reverse lookup for disconnect)
    /** @type {Map<string, string>} */
    const socketUsers = new Map();
    // userId → gameId for currently active games
    /** @type {Map<string, string>} */
    const userActiveGame = new Map();

    return {
        register(userId, socketId) {
            userSockets.set(userId, socketId);
            socketUsers.set(socketId, userId);
        },
        unregister(socketId) {
            const userId = socketUsers.get(socketId);
            socketUsers.delete(socketId);
            if (userId) userSockets.delete(userId);
            return userId;
        },
        userIdOf: (socketId) => socketUsers.get(socketId),
        activeGameOf: (userId) => userActiveGame.get(userId),
        hasActiveGame: (userId) => userActiveGame.has(userId),
        setActiveGame(userId, gameId) {
            userActiveGame.set(userId, gameId);
        },
        clearGame(gameId) {
            for (const [uid, gid] of userActiveGame.entries()) {
                if (gid === gameId) userActiveGame.delete(uid);
            }
        },
    };
}

module.exports = { createSessionRegistry };
