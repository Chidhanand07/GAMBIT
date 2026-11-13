// @ts-check
/**
 * Connection and `disconnect` bookkeeping. The user id is the one the
 * handshake middleware verified (`socket.data.userId`, NODE-10); there is no
 * `authenticate` event.
 */
const { TOKEN_RECONNECT_GRACE_MS, watchTokenExpiry } = require('../tokenLifetime');
const { guard } = require('../wrap');

/**
 * @typedef {import('../../services/emitter').ClientPort} ClientPort
 * @typedef {object} SessionHandlerDeps
 * @property {Pick<import('../sessionRegistry').SessionRegistry, 'register' | 'unregister' | 'socketsInGame'>} sessions
 * @property {{ reconnect: (userId: string, client: ClientPort) => Promise<void>,
 *   handleDisconnect: (userId: string | undefined, gameId: string | undefined) => Promise<void> }} gameService
 * @property {{ leaveQueueBySocket: (socketId: string) => void }} matchmaking
 * @property {(userId: string, gameId: string) => Promise<number>} [countPlayerSockets] player sockets at that
 *   board on every instance (Socket.IO adapter); without it only this instance is asked
 */

/**
 * Register the verified user for this connection, join their `user_<id>` room,
 * resume an active game (clears the disconnect grace period) and close the
 * connection when its token expires.
 * @param {import('socket.io').Socket} socket
 * @param {ClientPort} client
 * @param {SessionHandlerDeps} deps
 */
function registerSessionHandlers(socket, client, { sessions, gameService, matchmaking, countPlayerSockets }) {
    /** @type {string} */
    const userId = socket.data.userId;
    sessions.register(userId, socket.id);
    socket.join(`user_${userId}`);
    const cancelExpiry = watchTokenExpiry(socket);
    void guard('connection', () => gameService.reconnect(userId, client))();

    /**
     * Start the abandonment countdown in each game the player still has no socket in.
     * @param {string[]} gameIds
     */
    const leaveGames = async (gameIds) => {
        for (const gameId of gameIds) {
            if (sessions.socketsInGame(userId, gameId) > 0) continue;
            // Another instance may hold a socket of this player at this board (MULTI-INSTANCE).
            if (countPlayerSockets && (await countPlayerSockets(userId, gameId)) > 0) continue;
            await gameService.handleDisconnect(userId, gameId);
        }
    };

    socket.on(
        'disconnect',
        guard('disconnect', async () => {
            cancelExpiry();
            matchmaking.leaveQueueBySocket(socket.id);
            // Only games this player has no socket left in: closing one of two tabs is not leaving.
            const { orphanedGames } = sessions.unregister(socket.id);
            if (!socket.data.tokenExpired) return leaveGames(orphanedGames);
            // We closed this socket because its token expired. The client is coming straight back
            // with a fresh one; only if it has not re-joined by then did the player really leave.
            setTimeout(() => void guard('disconnect', () => leaveGames(orphanedGames))(), TOKEN_RECONNECT_GRACE_MS);
        }),
    );
}

module.exports = { registerSessionHandlers };
