// @ts-check
/**
 * Spectator events (ADR F-130): stop watching a game, and the lobby's request
 * for how many watch each live game. A disconnect stops every watch of the socket.
 */

const { schemas } = require('../schemas');
const { guard, wrap } = require('../wrap');
const { gameRoom } = require('../../services/emitter');

/**
 * @typedef {object} SpectatorHandlerService
 * @property {(gameId: string, socketId: string) => Promise<boolean>} unwatch
 * @property {(socketId: string) => Promise<void>} unwatchAll
 * @property {(gameIds: string[]) => Promise<Record<string, number>>} counts
 */

/**
 * @param {import('socket.io').Socket} socket
 * @param {{ spectatorService: SpectatorHandlerService, log?: import('../../observability/log').Log }} deps
 */
function registerSpectatorHandlers(socket, { spectatorService, log }) {
    socket.on(
        'leave_game',
        wrap(
            'leave_game',
            schemas.leave_game,
            async (/** @type {string} */ gameId) => {
                // Only a watching socket leaves the room: a player's links are the session's business.
                if (await spectatorService.unwatch(gameId, socket.id)) socket.leave(gameRoom(gameId));
            },
            log,
        ),
    );
    socket.on(
        'spectator_counts',
        wrap(
            'spectator_counts',
            schemas.spectator_counts,
            async (/** @type {{ game_ids: string[] }} */ data) => ({
                ok: true,
                counts: await spectatorService.counts(data.game_ids),
            }),
            log,
        ),
    );
    socket.on(
        'disconnect',
        guard('disconnect', () => spectatorService.unwatchAll(socket.id), log),
    );
}

module.exports = { registerSpectatorHandlers };
