// @ts-check
/**
 * Game room events: join, spectate, move, client-reported end.
 */

/**
 * @typedef {import('../../services/emitter').ClientPort} ClientPort
 * @typedef {object} GameHandlerService
 * @property {(gameId: string, client: ClientPort) => Promise<void>} joinGame
 * @property {(gameId: string, client: ClientPort) => Promise<void>} spectate
 * @property {(data: any, socketId: string) => Promise<void>} makeMove
 * @property {(data: any) => Promise<void>} endGame
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {ClientPort} client
 * @param {{ gameService: GameHandlerService }} deps
 */
function registerGameHandlers(socket, client, { gameService }) {
    socket.on('join_game', (gameId) => gameService.joinGame(gameId, client));
    socket.on('spectate_game', (gameId) => gameService.spectate(gameId, client));
    socket.on('make_move', (data) => gameService.makeMove(data, socket.id));
    socket.on('game_end', (data) => gameService.endGame(data));
}

module.exports = { registerGameHandlers };
