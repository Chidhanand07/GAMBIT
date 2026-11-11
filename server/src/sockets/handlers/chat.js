// @ts-check
/**
 * In-game chat.
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ chatService: { sendMessage: (data: any, socketId: string) => Promise<void> } }} deps
 */
function registerChatHandlers(socket, { chatService }) {
    socket.on('send_message', (data) => chatService.sendMessage(data, socket.id));
}

module.exports = { registerChatHandlers };
