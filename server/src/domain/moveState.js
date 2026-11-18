// @ts-check
/**
 * The game state after a legal move (NODE-11). Pure: the caller passes the
 * move chess.js played and the time it was made.
 */
const { clocksAfterMove } = require('./clock');
const { sideToMove } = require('./moveAuthorization');
const { clearedRequests } = require('./pendingRequests');

/**
 * @typedef {import('./chessRules').PlayedMove} PlayedMove
 */

/**
 * State after `played`: the mover's clock is charged (plus increment), the
 * move is appended to the log as UCI + SAN + FEN, the side to move flips, and
 * any standing request between the players (a draw offer) lapses.
 * @param {any} game
 * @param {PlayedMove} played
 * @param {number} at
 */
function stateAfterMove(game, played, at) {
    const movedSide = sideToMove(game);
    const clocks = clocksAfterMove({ ...game, activeSide: movedSide }, at);
    return {
        ...game,
        ...clearedRequests(game),
        fen: played.fen,
        whiteClockMs: clocks.whiteMs,
        blackClockMs: clocks.blackMs,
        activeSide: clocks.nextSide,
        lastMoveAt: at,
        moveLog: [...(game.moveLog || []), { move: played.uci, fen: played.fen, san: played.san }],
        ...clockLogAfter(game, clocks),
    };
}

/**
 * The per-ply clock snapshots a takeback restores (ADR F-152), extended by this move. Kept only
 * while it is in step with the move log: a game restored from the database has a move log
 * without snapshots, and starts none.
 * @param {any} game state before the move
 * @param {{ whiteMs: number, blackMs: number }} clocks both clocks right after the move
 * @returns {{ clockLog?: Array<{ whiteMs: number, blackMs: number }> }}
 */
function clockLogAfter(game, clocks) {
    const log = Array.isArray(game.clockLog) ? game.clockLog : [];
    if (log.length !== (game.moveLog?.length ?? 0)) return {};
    return { clockLog: [...log, { whiteMs: clocks.whiteMs, blackMs: clocks.blackMs }] };
}

module.exports = { stateAfterMove };
