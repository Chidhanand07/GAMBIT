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
 * @property {number} whiteClockMs time left as of `lastMoveAt` (or in total, while not running)
 * @property {number} blackClockMs
 * @property {string} activeSide
 * @property {number | null} [lastMoveAt] when the running clock was last charged; null before the first move
 * @property {number} [incrementMs]
 * @property {object | null} [disconnectInfo] set while a player is away: the clocks are frozen
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
 * Is a clock counting down right now? Not before the first move, and not
 * while a player is disconnected (the clocks are frozen for the grace period).
 * @param {ClockState} state
 * @returns {boolean}
 */
function isClockRunning(state) {
    return Boolean(state.lastMoveAt) && !state.disconnectInfo;
}

/**
 * Both clocks as of `now`. This is the one view of the clocks: the ticker,
 * the state sync and the disconnect snapshot all use it. While the clock is
 * running the side to move is charged for the time since `lastMoveAt`;
 * otherwise the stored values are the answer.
 * @param {ClockState} state
 * @param {number} now
 * @returns {{ whiteMs: number, blackMs: number }}
 */
function clocksAt(state, now) {
    let whiteMs = state.whiteClockMs;
    let blackMs = state.blackClockMs;
    if (isClockRunning(state)) {
        const elapsed = now - /** @type {number} */ (state.lastMoveAt);
        if (state.activeSide === 'w') whiteMs = remainingMs(whiteMs, elapsed);
        else blackMs = remainingMs(blackMs, elapsed);
    }
    return { whiteMs, blackMs };
}

/**
 * Time left for the side to move as of `now`.
 * @param {ClockState} state
 * @param {number} now
 * @returns {number}
 */
function activeRemainingMs(state, now) {
    const { whiteMs, blackMs } = clocksAt(state, now);
    return state.activeSide === 'w' ? whiteMs : blackMs;
}

/**
 * Fields to store when the clocks stop for a disconnect: the time used so far
 * is charged once, and `lastMoveAt` moves to `now` so nothing can charge it
 * again (G9). A clock that never started stays stopped.
 * @param {ClockState} state
 * @param {number} now
 * @returns {{ whiteClockMs: number, blackClockMs: number, lastMoveAt: number | null }}
 */
function freezeClocks(state, now) {
    const { whiteMs, blackMs } = clocksAt(state, now);
    return { whiteClockMs: whiteMs, blackClockMs: blackMs, lastMoveAt: state.lastMoveAt ? now : null };
}

/**
 * Fields to store when the clocks start again after a disconnect: counting
 * resumes from `now`, so the absence is not charged. Before the first move
 * there is no clock to resume (G8).
 * @param {ClockState} state
 * @param {number} now
 * @returns {{ lastMoveAt: number | null }}
 */
function resumeClocks(state, now) {
    return { lastMoveAt: state.lastMoveAt ? now : null };
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
 * the increment (`incrementMs ?? 0`) to the mover. A move is only ever applied
 * to a game nobody is disconnected from, so the clock is charged whenever it
 * has started.
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
    isClockRunning,
    clocksAt,
    activeRemainingMs,
    freezeClocks,
    resumeClocks,
    nextSide,
    clocksAfterMove,
    isGraceExpired,
};
