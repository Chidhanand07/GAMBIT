// @ts-check
/**
 * In-game chat.
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ chatService: { sendMessage: (data: any, userId: string) => Promise<unknown> },
 *   log?: import('../../observability/log').Log }} deps
 */
function registerChatHandlers(socket, { chatService, log }) {
    /** @type {string} */
    const userId = socket.data.userId;
    socket.on(
        'send_message',
        wrap('send_message', schemas.send_message, (data) => chatService.sendMessage(data, userId), log),
    );
}

module.exports = { registerChatHandlers };
