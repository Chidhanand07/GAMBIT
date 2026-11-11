// @ts-check
/**
 * `authenticate` and `disconnect`. The user id is whatever the client sends
 * (known bug, preserved; NODE-10).
 */

const { schemas } = require('../schemas');
const { wrap, guard } = require('../wrap');

/**
 * @typedef {import('../../services/emitter').ClientPort} ClientPort
 * @typedef {object} SessionHandlerDeps
 * @property {import('../sessionRegistry').SessionRegistry} sessions
 * @property {{ reconnect: (userId: string, client: ClientPort) => Promise<void>,
 *   handleDisconnect: (userId: string | undefined) => Promise<void> }} gameService
 * @property {{ leaveQueueBySocket: (socketId: string) => void }} matchmaking
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {ClientPort} client
 * @param {SessionHandlerDeps} deps
 */
function registerSessionHandlers(socket, client, { sessions, gameService, matchmaking }) {
    socket.on(
        'authenticate',
        wrap('authenticate', schemas.authenticate, async (userId) => {
            sessions.register(userId, socket.id);
            socket.join(`user_${userId}`);
            socket.emit('authenticated', { userId });
            // If reconnecting while in an active game, clear the disconnect grace period in Redis
            await gameService.reconnect(userId, client);
        }),
    );

    socket.on(
        'disconnect',
        guard('disconnect', async () => {
            matchmaking.leaveQueueBySocket(socket.id);
            const userId = sessions.unregister(socket.id);
            // If this user is in an active game, set disconnectInfo in Redis (global clock handles timeout)
            await gameService.handleDisconnect(userId);
        }),
    );
}

module.exports = { registerSessionHandlers };
