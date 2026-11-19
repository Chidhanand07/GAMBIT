// @ts-check
/**
 * Game room events: join, spectate, move, resign, draw offers, takebacks, premoves. There is no `game_end`
 * handler: results are decided by the server (NODE-16).
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @typedef {import('../../services/emitter').ClientPort} ClientPort
 * @typedef {object} GameHandlerService
 * @property {(gameId: string, client: ClientPort, userId: string) => Promise<unknown>} joinGame
 *   may answer `{ ok: false, error: 'spectating_off' }` (ADR F-140)
 * @property {(gameId: string, client: ClientPort, userId: string) => Promise<unknown>} spectate
 * @property {(data: any, userId: string, client: ClientPort) => Promise<unknown>} makeMove
 * @property {(data: any, userId: string) => Promise<unknown>} resign
 * @property {(data: any, userId: string) => Promise<unknown>} offerDraw
 * @property {(data: any, userId: string) => Promise<unknown>} acceptDraw
 * @property {(data: any, userId: string) => Promise<unknown>} declineDraw
 * @property {(data: any, userId: string) => Promise<unknown>} requestTakeback
 * @property {(data: any, userId: string) => Promise<unknown>} acceptTakeback
 * @property {(data: any, userId: string) => Promise<unknown>} declineTakeback
 * @property {(data: any, userId: string) => Promise<unknown>} setPremove
 * @property {(data: any, userId: string) => Promise<unknown>} cancelPremove
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
        spectate_game: (gameId) => gameService.spectate(gameId, client, userId),
        make_move: (data) => gameService.makeMove(data, userId, client),
        resign: (data) => gameService.resign(data, userId),
        draw_offer: (data) => gameService.offerDraw(data, userId),
        draw_accept: (data) => gameService.acceptDraw(data, userId),
        draw_decline: (data) => gameService.declineDraw(data, userId),
        takeback_request: (data) => gameService.requestTakeback(data, userId),
        takeback_accept: (data) => gameService.acceptTakeback(data, userId),
        takeback_decline: (data) => gameService.declineTakeback(data, userId),
        premove_set: (data) => gameService.setPremove(data, userId),
        premove_cancel: (data) => gameService.cancelPremove(data, userId),
    };
    for (const [event, handler] of Object.entries(handlers)) {
        socket.on(event, wrap(event, schemas[/** @type {keyof typeof schemas} */ (event)], handler, log));
    }
}

module.exports = { registerGameHandlers };
