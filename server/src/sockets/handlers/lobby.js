// @ts-check
/**
 * Matchmaking queue events. `leave_queue` accepts any user id (known bug, preserved).
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ matchmaking: { requestMatch: (data: any, socketId: string) => Promise<void>,
 *   leaveQueue: (userId: string) => void } }} deps
 */
function registerLobbyHandlers(socket, { matchmaking }) {
    socket.on(
        'join_queue',
        wrap('join_queue', schemas.join_queue, (data) => matchmaking.requestMatch(data, socket.id)),
    );
    socket.on(
        'leave_queue',
        wrap('leave_queue', schemas.leave_queue, (userId) => {
            matchmaking.leaveQueue(userId);
        }),
    );
}

module.exports = { registerLobbyHandlers };
