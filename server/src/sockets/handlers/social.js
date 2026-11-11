// @ts-check
/**
 * Rematch and challenge events (payload user ids are client-asserted; known bug, preserved).
 */

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
    socket.on('rematch_request', (data) => socialService.requestRematch(data));
    socket.on('rematch_accept', (data) => socialService.acceptRematch(data));
    socket.on('rematch_decline', (data) => socialService.declineRematch(data));
    socket.on('challenge_request', (data) => socialService.requestChallenge(data));
    socket.on('challenge_accept', (data) => socialService.acceptChallenge(data));
    socket.on('challenge_decline', (data) => socialService.declineChallenge(data));
}

module.exports = { registerSocialHandlers };
