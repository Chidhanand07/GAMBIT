// @ts-check
/**
 * The server's own chess rules (NODE-11, NODE-16, SEC-09). Pure: the position
 * is rebuilt from server-held state with chess.js, a move is `from`/`to`
 * (+ promotion piece), and everything reported back (UCI, SAN, FEN) is
 * computed here. No engine round trip, and no FEN, SAN or UCI from a client
 * is ever read.
 */
const { Chess } = require('chess.js');
const { START_FEN } = require('./gameState');

/**
 * @typedef {object} RulesState the slice of the Redis game state the rules read
 * @property {string | null} [fen] current position; the authority for legality
 * @property {string | null} [startFen] position the move log starts from
 * @property {Array<{ move?: unknown } | null | undefined> | null} [moveLog] one entry per ply; `move` is UCI
 */

/**
 * @typedef {object} MoveInput
 * @property {string} [from]
 * @property {string} [to]
 * @property {string} [promotion] 'q' | 'r' | 'b' | 'n'; ignored unless the move promotes
 */

/**
 * @typedef {object} PlayedMove
 * @property {true} legal
 * @property {string} uci e.g. "e2e4", "a7a8q"
 * @property {string} san
 * @property {string} fen position after the move
 * @property {string} flags chess.js move flags ('k'/'q' castle, 'p' promotion, 'e' en passant, …)
 * @property {boolean} captured
 * @property {import('chess.js').Chess} position the board after the move, with its history
 */

const UCI_FROM = 0;
const UCI_TO = 2;
const UCI_PROMOTION = 4;

/**
 * Replay a UCI move list from `startFen`; null when any move does not apply.
 * @param {string} startFen
 * @param {string[]} ucis
 * @returns {import('chess.js').Chess | null}
 */
function replay(startFen, ucis) {
    try {
        const chess = new Chess(startFen);
        for (const uci of ucis) {
            chess.move({
                from: uci.slice(UCI_FROM, UCI_TO),
                to: uci.slice(UCI_TO, UCI_PROMOTION),
                promotion: uci[UCI_PROMOTION],
            });
        }
        return chess;
    } catch {
        return null;
    }
}

/**
 * The move log as UCI strings, or null when it cannot be replayed (no
 * `startFen`, or entries written before the server recorded UCI).
 * @param {RulesState} game
 * @returns {string[] | null}
 */
function uciHistory(game) {
    if (!game.startFen) return null;
    const ucis = (game.moveLog ?? []).map((entry) => entry?.move);
    return ucis.every((uci) => typeof uci === 'string') ? /** @type {string[]} */ (ucis) : null;
}

/**
 * The position the server trusts for `game`.
 *
 * The stored FEN is the authority for legality. When the UCI history replays
 * from `startFen` to exactly that FEN, the replayed board is used instead, so
 * threefold repetition can be detected. A history that is missing, corrupt or
 * inconsistent is ignored rather than trusted.
 * @param {RulesState} game
 * @returns {import('chess.js').Chess}
 * @throws when the stored FEN itself is not a valid position
 */
function positionOf(game) {
    const fen = game.fen || START_FEN;
    const history = uciHistory(game);
    if (history) {
        const replayed = replay(/** @type {string} */ (game.startFen), history);
        if (replayed && replayed.fen() === fen) return replayed;
    }
    return new Chess(fen);
}

/**
 * Try `move` in the current position of `game`. `game` is not modified.
 * @param {RulesState} game
 * @param {MoveInput} move
 * @returns {PlayedMove | { legal: false }}
 */
function playMove(game, { from, to, promotion }) {
    if (!from || !to) return { legal: false };
    const chess = positionOf(game);
    try {
        const played = chess.move({ from, to, promotion });
        return {
            legal: true,
            uci: played.lan,
            san: played.san,
            fen: chess.fen(),
            flags: played.flags,
            captured: Boolean(played.captured),
            position: chess,
        };
    } catch {
        // chess.js throws on an illegal move.
        return { legal: false };
    }
}

module.exports = { START_FEN, positionOf, playMove };
