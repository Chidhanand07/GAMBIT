// @ts-check
/**
 * In-game chat.
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ chatService: { sendMessage: (data: any, userId: string) => Promise<unknown> } }} deps
 */
function registerChatHandlers(socket, { chatService }) {
    /** @type {string} */
    const userId = socket.data.userId;
    socket.on(
        'send_message',
        wrap('send_message', schemas.send_message, (data) => chatService.sendMessage(data, userId)),
    );
}

module.exports = { registerChatHandlers };
