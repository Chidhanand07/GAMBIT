// @ts-check
/**
 * What a (re)joining client is told about a game: `game_end` for a finished game,
 * otherwise `game_state_sync` (position, move log, clocks, the spectator count, the standing requests and
 * the viewer's own premove). Split out of gameService (SIZE-01).
 */
const { clocksAt, isClockRunning } = require('../domain/clock');
const { requestsView } = require('../domain/pendingRequests');
const { premoveView } = require('../domain/premove');
const { resultLabel } = require('../domain/result');

/**
 * @typedef {import('./emitter').ClientPort} ClientPort
 */

/**
 * Send `client` the authoritative view of `game`: the result when it is over,
 * otherwise position, move log and clocks (`game_state_sync`), the standing requests,
 * and the viewer's own queued premove.
 * @param {number} now
 * @param {any} game
 * @param {ClientPort} client
 * @param {{ viewerId?: string, spectators?: number, takebackPrefs?: Record<'white' | 'black', boolean> }} [viewer]
 *   the connection's verified user, how many watch when known (F-130), and the players' stored
 *   takeback switches (F-166)
 */
function sendState(now, game, client, { viewerId, spectators, takebackPrefs } = {}) {
    // If game is already completed in Redis, notify joining client
    if (game.status === 'completed') {
        client.emit('game_end', {
            game_id: game.id,
            result: resultLabel(game.result),
            reason: game.reason || 'Game over',
            white_id: game.whiteId,
            black_id: game.blackId,
        });
        return;
    }

    // Real remaining time (frozen while a player is disconnected or before the first move).
    const { whiteMs, blackMs } = clocksAt(game, now);

    client.emit('game_state_sync', {
        fen: game.fen,
        moveLog: game.moveLog || [],
        whiteMs,
        blackMs,
        activeSide: game.activeSide,
        clockActive: isClockRunning(game),
        whiteId: game.whiteId,
        blackId: game.blackId,
        ...(spectators === undefined ? {} : { spectators }),
        ...requestsView(game),
        ...(takebackPrefs ? { takebackPrefs } : {}),
        ...premoveView(game, viewerId),
    });
}

module.exports = { sendState };
