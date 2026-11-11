// @ts-check
/**
 * Rematch and challenge events (payload user ids are client-asserted; known bug, preserved).
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @typedef {object} SocialHandlerService
 * @property {(data: any) => Promise<void>} requestRematch
 * @property {(data: any) => Promise<void>} acceptRematch
 * @property {(data: any) => void} declineRematch
 * @property {(data: any) => Promise<void>} requestChallenge
 * @property {(data: any) => Promise<void>} acceptChallenge
 * @property {(data: any) => void} declineChallenge
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ socialService: SocialHandlerService }} deps
 */
function registerSocialHandlers(socket, { socialService }) {
    /** @type {Record<string, (payload: any) => unknown>} */
    const handlers = {
        rematch_request: (data) => socialService.requestRematch(data),
        rematch_accept: (data) => socialService.acceptRematch(data),
        rematch_decline: (data) => socialService.declineRematch(data),
        challenge_request: (data) => socialService.requestChallenge(data),
        challenge_accept: (data) => socialService.acceptChallenge(data),
        challenge_decline: (data) => socialService.declineChallenge(data),
    };
    for (const [event, handler] of Object.entries(handlers)) {
        socket.on(event, wrap(event, schemas[/** @type {keyof typeof schemas} */ (event)], handler));
    }
}

module.exports = { registerSocialHandlers };
