// @ts-check
/**
 * The game-state object stored in Redis (`game:<id>`). Its key order is
 * observable (it is JSON-serialised), so it is built in exactly one place.
 */
const { initialClockMs, parseIncrementMs } = require('./timeControl');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * @typedef {object} GameState
 * @property {string} id
 * @property {string} fen
 * @property {string} startFen position the move log starts from (the rules replay from here)
 * @property {string | null} whiteId
 * @property {string | null} blackId
 * @property {number} whiteClockMs
 * @property {number} blackClockMs
 * @property {string} activeSide
 * @property {string} status
 * @property {string | null} result
 * @property {string | null} reason
 * @property {Array<object>} moveLog
 * @property {unknown} timeControl
 * @property {number} incrementMs
 * @property {boolean} isRated
 * @property {number | null} lastMoveAt
 * @property {object | null} disconnectInfo
 */

/**
 * A fresh active game. Clocks default to the time control's starting time,
 * `fen` to the start position, `activeSide` to 'w' and `lastMoveAt` to null
 * (each default applies only when the field is `undefined`). `isRated` has no
 * default: each caller applies its own.
 * @param {object} init
 * @param {string} init.id
 * @param {string | null} init.whiteId
 * @param {string | null} init.blackId
 * @param {unknown} init.timeControl
 * @param {boolean} init.isRated
 * @param {string} [init.fen]
 * @param {number} [init.whiteClockMs]
 * @param {number} [init.blackClockMs]
 * @param {string} [init.activeSide]
 * @param {number | null} [init.lastMoveAt]
 * @returns {GameState}
 */
function createInitialGameState({
    id,
    whiteId,
    blackId,
    timeControl,
    isRated,
    fen = START_FEN,
    whiteClockMs = initialClockMs(timeControl),
    blackClockMs = initialClockMs(timeControl),
    activeSide = 'w',
    lastMoveAt = null,
}) {
    return {
        id,
        fen,
        startFen: fen,
        whiteId,
        blackId,
        whiteClockMs,
        blackClockMs,
        activeSide,
        status: 'active',
        result: null,
        reason: null,
        moveLog: [],
        timeControl,
        incrementMs: parseIncrementMs(timeControl),
        isRated,
        lastMoveAt,
        disconnectInfo: null,
    };
}

/**
 * Side to move from a FEN's second field; 'w' when the FEN or the field is missing.
 * @param {string | null | undefined} fen
 * @returns {string}
 */
function activeSideFromFen(fen) {
    return fen ? (fen.split(' ')[1] ?? 'w') : 'w';
}

/**
 * @typedef {object} ActiveGameRow
 * @property {string | null} white_id
 * @property {string | null} black_id
 * @property {boolean | null} [is_rated]
 * @property {string} time_control
 * @property {string | null} [fen]
 * @property {number | null} [white_clock_ms]
 * @property {number | null} [black_clock_ms]
 */

/**
 * Rebuild the Redis state of an active game from its `games` row (server
 * restart fallback). The clock is running (`lastMoveAt = now`) unless both
 * clock columns are exactly null; unrated unless the row says otherwise.
 * @param {string} gameId
 * @param {ActiveGameRow} row
 * @param {number} now
 * @returns {GameState}
 */
function gameStateFromRow(gameId, row, now) {
    const clockMs = initialClockMs(row.time_control);
    return createInitialGameState({
        id: gameId,
        fen: row.fen || START_FEN,
        whiteId: row.white_id,
        blackId: row.black_id,
        whiteClockMs: row.white_clock_ms ?? clockMs,
        blackClockMs: row.black_clock_ms ?? clockMs,
        activeSide: activeSideFromFen(row.fen),
        timeControl: row.time_control,
        isRated: row.is_rated ?? false,
        lastMoveAt: row.white_clock_ms !== null || row.black_clock_ms !== null ? now : null,
    });
}

module.exports = { START_FEN, createInitialGameState, activeSideFromFen, gameStateFromRow };
