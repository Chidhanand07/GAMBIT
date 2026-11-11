// @ts-check
/**
 * Matchmaking queue events. `leave_queue` accepts any user id (known bug, preserved).
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ matchmaking: { requestMatch: (data: any, socketId: string) => Promise<void>,
 *   leaveQueue: (userId: string) => void } }} deps
 */
function registerLobbyHandlers(socket, { matchmaking }) {
    socket.on('join_queue', (data) => matchmaking.requestMatch(data, socket.id));
    socket.on('leave_queue', (userId) => {
        matchmaking.leaveQueue(userId);
    });
}

module.exports = { registerLobbyHandlers };
