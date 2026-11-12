// @ts-check
/**
 * Connection and `disconnect` bookkeeping. The user id is the one the
 * handshake middleware verified (`socket.data.userId`, NODE-10); there is no
 * `authenticate` event.
 */
const { guard } = require('../wrap');

/**
 * @typedef {import('../../services/emitter').ClientPort} ClientPort
 * @typedef {object} SessionHandlerDeps
 * @property {import('../sessionRegistry').SessionRegistry} sessions
 * @property {{ reconnect: (userId: string, client: ClientPort) => Promise<void>,
 *   handleDisconnect: (userId: string | undefined, gameId: string | undefined) => Promise<void> }} gameService
 * @property {{ leaveQueueBySocket: (socketId: string) => void }} matchmaking
 */

/**
 * Register the verified user for this connection, join their `user_<id>` room
 * and resume an active game (clears the disconnect grace period).
 * @param {import('socket.io').Socket} socket
 * @param {ClientPort} client
 * @param {SessionHandlerDeps} deps
 */
function registerSessionHandlers(socket, client, { sessions, gameService, matchmaking }) {
    /** @type {string} */
    const userId = socket.data.userId;
    sessions.register(userId, socket.id);
    socket.join(`user_${userId}`);
    void guard('connection', () => gameService.reconnect(userId, client))();

    socket.on(
        'disconnect',
        guard('disconnect', async () => {
            matchmaking.leaveQueueBySocket(socket.id);
            // Only games this player has no socket left in: closing one of two tabs is not leaving.
            const { orphanedGames } = sessions.unregister(socket.id);
            for (const gameId of orphanedGames) await gameService.handleDisconnect(userId, gameId);
        }),
    );
}

module.exports = { registerSessionHandlers };
