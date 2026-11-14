// @ts-check
/**
 * Game room events: join, spectate, move, resign. There is no `game_end`
 * handler: results are decided by the server (NODE-16).
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @typedef {import('../../services/emitter').ClientPort} ClientPort
 * @typedef {object} GameHandlerService
 * @property {(gameId: string, client: ClientPort, userId: string) => Promise<void>} joinGame
 * @property {(gameId: string, client: ClientPort) => Promise<void>} spectate
 * @property {(data: any, userId: string, client: ClientPort) => Promise<unknown>} makeMove
 * @property {(data: any, userId: string) => Promise<unknown>} resign
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {ClientPort} client
 * @param {{ gameService: GameHandlerService, log?: import('../../observability/log').Log }} deps
 */
function registerGameHandlers(socket, client, { gameService, log }) {
    /** @type {string} */
    const userId = socket.data.userId;
    /** @type {Record<string, (payload: any) => unknown>} */
    const handlers = {
        join_game: (gameId) => gameService.joinGame(gameId, client, userId),
        spectate_game: (gameId) => gameService.spectate(gameId, client),
        make_move: (data) => gameService.makeMove(data, userId, client),
        resign: (data) => gameService.resign(data, userId),
    };
    for (const [event, handler] of Object.entries(handlers)) {
        socket.on(event, wrap(event, schemas[/** @type {keyof typeof schemas} */ (event)], handler, log));
    }
}

module.exports = { registerGameHandlers };
