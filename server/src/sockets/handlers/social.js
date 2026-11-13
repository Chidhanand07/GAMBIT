// @ts-check
/**
 * Rematch and challenge events. The acting side of every event is the
 * connection's verified user (NODE-10): the sender of a request, the answerer
 * of an accept or decline. The other party's id comes from the payload, and
 * the service only honours an answer to a request that is actually pending.
 */

const { schemas } = require('../schemas');
const { wrap } = require('../wrap');

/**
 * @typedef {object} SocialHandlerService
 * @property {(data: any) => Promise<unknown>} requestRematch
 * @property {(data: any) => Promise<unknown>} acceptRematch
 * @property {(data: any) => Promise<unknown>} declineRematch
 * @property {(data: any) => Promise<unknown>} requestChallenge
 * @property {(data: any) => Promise<unknown>} acceptChallenge
 * @property {(data: any) => Promise<unknown>} declineChallenge
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ socialService: SocialHandlerService, log?: import('../../observability/log').Log }} deps
 */
function registerSocialHandlers(socket, { socialService, log }) {
    /** @type {string} */
    const userId = socket.data.userId;
    /** @type {Record<string, (payload: any) => unknown>} */
    const handlers = {
        rematch_request: (data) => socialService.requestRematch({ ...data, from_user_id: userId }),
        rematch_accept: (data) => socialService.acceptRematch({ ...data, to_user_id: userId }),
        rematch_decline: (data) => socialService.declineRematch({ ...data, to_user_id: userId }),
        challenge_request: (data) => socialService.requestChallenge({ ...data, from_user_id: userId }),
        challenge_accept: (data) => socialService.acceptChallenge({ ...data, to_user_id: userId }),
        challenge_decline: (data) => socialService.declineChallenge({ ...data, to_user_id: userId }),
    };
    for (const [event, handler] of Object.entries(handlers)) {
        socket.on(event, wrap(event, schemas[/** @type {keyof typeof schemas} */ (event)], handler, log));
    }
}

module.exports = { registerSocialHandlers };
