// @ts-check
/**
 * The global clock tick: sync running clocks, and end games the clock decides
 * (flag fall, abandonment after the disconnect grace period). Ending a game is
 * not done here: the tick hands its verdict to the one finalizer, so a game
 * that ends on time gets the same database row, rating, review and `game_end`
 * payload as any other ending (G3, NODE-18).
 */
const { REASON } = require('../domain/adjudication');
const { tickerSnapshot, isGraceExpired } = require('../domain/clock');
const { opponentColor, sideToColor } = require('../domain/result');
const { gameRoom } = require('./emitter');

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {import('../domain/gameState').GameState} GameState
 * @typedef {import('../domain/adjudication').Verdict} Verdict
 */

/**
 * @typedef {object} ClockDeps
 * @property {{ getGame: (id: string) => Promise<any>, getActiveGameIds: () => Promise<string[]> }} gameStore
 * @property {{ endGameIf: (gameId: string, decide: (game: any) => Verdict | null) => Promise<boolean> }} finalizer
 * @property {Emitter} emitter
 * @property {() => number} now
 */

/**
 * Whether the clock ends `game` at `at`, and for whom. Pure. A disconnected
 * player's clock is paused; after the grace period the opponent wins by
 * abandonment. Otherwise the side to move loses when its time is up.
 * @param {GameState} game an active game whose clock has started
 * @param {number} at
 * @returns {Verdict | null}
 */
function clockVerdict(game, at) {
    const disconnectInfo = /** @type {{ side: string, at: number } | null} */ (game.disconnectInfo);
    // ── Disconnect grace period check (20 s) ──
    if (disconnectInfo) {
        if (!isGraceExpired(disconnectInfo, at)) return null; // clock paused while opponent is disconnected
        return { winner: opponentColor(disconnectInfo.side), reason: REASON.ABANDONMENT };
    }
    // ── Clock timeout ──
    if (tickerSnapshot(game, at).remainingMs > 0) return null;
    return { winner: opponentColor(sideToColor(game.activeSide)), reason: REASON.TIME };
}

/** @param {any} game */
const isRunning = (game) => Boolean(game && game.status === 'active' && game.lastMoveAt);

/**
 * One game's tick: broadcast the running clock, then let the finalizer end the
 * game if the clock says so. The verdict is taken again on the state the
 * finalizer reads inside the per-game lock, not on this tick's earlier read:
 * a move, a reconnect or another ending that landed in between wins.
 * @param {ClockDeps} deps
 * @param {string} gameId
 */
async function tickGame(deps, gameId) {
    const game = await deps.gameStore.getGame(gameId);
    if (!isRunning(game)) return;

    const at = deps.now();
    // Real remaining for the active player
    const { whiteMs, blackMs } = tickerSnapshot(game, at);
    deps.emitter.toRoom(gameRoom(gameId), 'clock_sync', { whiteMs, blackMs, serverTs: at });

    if (!clockVerdict(game, at)) return;
    await deps.finalizer.endGameIf(gameId, (current) => (isRunning(current) ? clockVerdict(current, at) : null));
}

/**
 * One run of the global ticker over every active game. Errors are logged per
 * game, so one broken game does not stop the others.
 * @param {ClockDeps} deps
 * @returns {Promise<void>}
 */
async function tick(deps) {
    try {
        const gameIds = await deps.gameStore.getActiveGameIds();
        if (!gameIds.length) return;

        await Promise.all(
            gameIds.map(async (gameId) => {
                try {
                    await tickGame(deps, gameId);
                } catch (e) {
                    console.error(`[clock] game ${gameId} error:`, /** @type {Error} */ (e).message);
                }
            }),
        );
    } catch (e) {
        console.error('[clock] ticker error:', /** @type {Error} */ (e).message);
    }
}

/**
 * @param {Omit<ClockDeps, 'now'> & { now?: () => number }} deps
 */
function createClockService({ now = () => Date.now(), ...rest }) {
    /** @type {ClockDeps} */
    const deps = { ...rest, now };
    return {
        /** One ticker run (see `tick`). */
        tick: () => tick(deps),
    };
}

module.exports = { createClockService };
