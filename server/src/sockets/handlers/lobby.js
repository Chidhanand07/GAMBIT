// @ts-check
/**
 * Matchmaking queue events. The queued player is always the connection's
 * verified user; ids in the payload are ignored (NODE-10, G13).
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ matchmaking: { requestMatch: (data: any, socketId: string) => Promise<void>,
 *   leaveQueue: (userId: string) => void }, log?: import('../../observability/log').Log }} deps
 */
function registerLobbyHandlers(socket, { matchmaking, log }) {
    /** @type {string} */
    const userId = socket.data.userId;
    socket.on(
        'join_queue',
        wrap(
            'join_queue',
            schemas.join_queue,
            (data) => matchmaking.requestMatch({ ...data, user: { id: userId } }, socket.id),
            log,
        ),
    );
    socket.on(
        'leave_queue',
        wrap(
            'leave_queue',
            schemas.leave_queue,
            () => {
                matchmaking.leaveQueue(userId);
            },
            log,
        ),
    );
}

module.exports = { registerLobbyHandlers };
