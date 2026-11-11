// @ts-check
/**
 * Chess-clock arithmetic on the Redis game state. Pure: the caller passes `now`.
 *
 * Side convention (kept from the original code): `activeSide === 'w'` charges
 * White; any other value charges Black.
 */

const DISCONNECT_GRACE_MS = 20000;

/**
 * @typedef {object} ClockState
 * @property {number} whiteClockMs
 * @property {number} blackClockMs
 * @property {string} activeSide
 * @property {number | null} [lastMoveAt]
 * @property {number} [incrementMs]
 */

/**
 * Time left on a clock after `elapsedMs`, never below zero.
 * @param {number} clockMs
 * @param {number} elapsedMs
 * @returns {number}
 */
function remainingMs(clockMs, elapsedMs) {
    return Math.max(0, clockMs - elapsedMs);
}

/**
 * Both clocks as of `now`: the active side is charged for the time since the
 * last move. Unchanged when the clock has not started (`lastMoveAt` falsy).
 * @param {ClockState} state
 * @param {number} now
 * @returns {{ whiteMs: number, blackMs: number }}
 */
function clocksAt(state, now) {
    let whiteMs = state.whiteClockMs;
    let blackMs = state.blackClockMs;
    if (state.lastMoveAt) {
        const elapsed = now - state.lastMoveAt;
        if (state.activeSide === 'w') whiteMs = remainingMs(whiteMs, elapsed);
        else blackMs = remainingMs(blackMs, elapsed);
    }
    return { whiteMs, blackMs };
}

/**
 * The opposite side ('w' → 'b', anything else → 'w').
 * @param {string} side
 * @returns {'w' | 'b'}
 */
function nextSide(side) {
    return side === 'w' ? 'b' : 'w';
}

/**
 * Clocks after the active side moves at `now`: charge elapsed time, then add
 * the increment (`incrementMs ?? 0`) to the mover.
 * @param {ClockState} state
 * @param {number} now
 * @returns {{ whiteMs: number, blackMs: number, nextSide: 'w' | 'b' }}
 */
function clocksAfterMove(state, now) {
    let { whiteMs, blackMs } = clocksAt(state, now);
    const incMs = state.incrementMs ?? 0;
    if (state.activeSide === 'w') whiteMs += incMs;
    else blackMs += incMs;
    return { whiteMs, blackMs, nextSide: nextSide(state.activeSide) };
}

/**
 * What the global ticker broadcasts. Differs from `clocksAt` on purpose (kept
 * from the original ticker): `lastMoveAt` is assumed set, and Black's displayed
 * clock is only replaced when `activeSide === 'b'` exactly.
 * @param {ClockState} state
 * @param {number} now
 * @returns {{ remainingMs: number, whiteMs: number, blackMs: number }}
 */
function tickerSnapshot(state, now) {
    const elapsed = now - /** @type {number} */ (state.lastMoveAt);
    const side = state.activeSide;
    const remaining =
        side === 'w' ? remainingMs(state.whiteClockMs, elapsed) : remainingMs(state.blackClockMs, elapsed);
    return {
        remainingMs: remaining,
        whiteMs: side === 'w' ? remaining : state.whiteClockMs,
        blackMs: side === 'b' ? remaining : state.blackClockMs,
    };
}

/**
 * True once a disconnected player's 20 s grace period has run out.
 * @param {{ at: number }} disconnectInfo
 * @param {number} now
 * @returns {boolean}
 */
function isGraceExpired(disconnectInfo, now) {
    return now - disconnectInfo.at >= DISCONNECT_GRACE_MS;
}

module.exports = {
    DISCONNECT_GRACE_MS,
    remainingMs,
    clocksAt,
    nextSide,
    clocksAfterMove,
    tickerSnapshot,
    isGraceExpired,
};
