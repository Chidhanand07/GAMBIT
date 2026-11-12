// @ts-check
/**
 * The global clock tick: sync running clocks, and end games the clock decides
 * (flag fall, abandonment after the disconnect grace period, a first move that
 * never came: domain/clockVerdict). Ending a game is
 * not done here: the tick hands its verdict to the one finalizer, so a game
 * that ends on time gets the same database row, rating, review and `game_end`
 * payload as any other ending (G3, NODE-18).
 */
const { clocksAt } = require('../domain/clock');
const { clockVerdict } = require('../domain/clockVerdict');
const { gameRoom } = require('./emitter');

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {import('../domain/gameState').GameState} GameState
 * @typedef {import('../domain/adjudication').Verdict} Verdict
 */

/**
 * @typedef {object} ClockDeps
 * @property {{ getGame: (id: string) => Promise<any>, getActiveGameIds: () => Promise<string[]> }} gameStore
 * @property {{ endGameIf: (gameId: string, decide: (game: any) => Verdict | null, at?: number) => Promise<boolean> }} finalizer
 * @property {Emitter} emitter
 * @property {() => number} now
 */

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
    if (!game || game.status !== 'active') return;

    const at = deps.now();
    // Nothing to show before the first move: no clock has started.
    if (game.lastMoveAt) {
        // Real remaining for the active player (frozen while a player is disconnected)
        const { whiteMs, blackMs } = clocksAt(game, at);
        deps.emitter.toRoom(gameRoom(gameId), 'clock_sync', { whiteMs, blackMs, serverTs: at });
    }

    if (!clockVerdict(game, at)) return;
    await deps.finalizer.endGameIf(gameId, (current) => clockVerdict(current, at), at);
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
