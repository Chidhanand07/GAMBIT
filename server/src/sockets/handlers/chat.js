// @ts-check
/**
 * In-game chat.
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ chatService: { sendMessage: (data: any, socketId: string) => Promise<void> } }} deps
 */
function registerChatHandlers(socket, { chatService }) {
    socket.on(
        'send_message',
        wrap('send_message', schemas.send_message, (data) => chatService.sendMessage(data, socket.id)),
    );
}

module.exports = { registerChatHandlers };
