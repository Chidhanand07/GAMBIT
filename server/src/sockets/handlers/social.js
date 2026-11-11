// @ts-check
/**
 * Rematch and challenge events. The acting side of every event is the
 * connection's verified user (NODE-10): the sender of a request, the
 * recipient of an accept. Ids for the *other* party still come from the payload.
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
    /** @type {string} */
    const userId = socket.data.userId;
    /** @type {Record<string, (payload: any) => unknown>} */
    const handlers = {
        rematch_request: (data) => socialService.requestRematch({ ...data, from_user_id: userId }),
        rematch_accept: (data) => socialService.acceptRematch({ ...data, to_user_id: userId }),
        rematch_decline: (data) => socialService.declineRematch(data),
        challenge_request: (data) => socialService.requestChallenge({ ...data, from_user_id: userId }),
        challenge_accept: (data) => socialService.acceptChallenge({ ...data, to_user_id: userId }),
        challenge_decline: (data) => socialService.declineChallenge(data),
    };
    for (const [event, handler] of Object.entries(handlers)) {
        socket.on(event, wrap(event, schemas[/** @type {keyof typeof schemas} */ (event)], handler));
    }
}

module.exports = { registerSocialHandlers };
