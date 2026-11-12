// @ts-check
/**
 * The global clock tick: sync running clocks, flag players on time and end
 * games after the disconnect grace period. Moved from `server/services/clock.js`,
 * which keeps the interval handle and the public API as a facade.
 */
const { tickerSnapshot, isGraceExpired } = require('../domain/clock');
const { resultLabel, opponentColor, sideToColor, colorOfPlayer, playerIdOf } = require('../domain/result');
const { gameRoom } = require('./emitter');

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {import('../domain/gameState').GameState} GameState
 */

/**
 * @typedef {object} ClockGameStorePort
 * @property {(id: string) => Promise<any>} getGame
 * @property {(id: string, mutate: (game: any) => any) => Promise<any>} mutateGame
 * @property {(id: string) => Promise<void>} removeActiveGame
 * @property {() => Promise<string[]>} getActiveGameIds
 */

/**
 * @typedef {object} ClockGamesPort
 * @property {(id: string, fields: object) => PromiseLike<{ data: unknown }>} finishIfActive
 */

/**
 * @typedef {object} ClockDeps
 * @property {ClockGameStorePort} gameStore
 * @property {ClockGamesPort} gamesRepo
 * @property {() => { processGameEnd: Function }} getRatingService resolved when a game is rated
 * @property {Emitter} emitter
 * @property {() => number} now
 */

/**
 * Mark the game finished in the DB (only if still active) and rate it.
 * `reason` is accepted but unused, as before.
 * @param {ClockDeps} deps
 * @param {{ gameId: string, game: GameState, winnerId: string | null, reason?: string }} p
 * @returns {Promise<void>}
 */
async function finalizeExpiredGame({ gamesRepo, getRatingService, emitter }, { gameId, game, winnerId }) {
    const outcome = colorOfPlayer(winnerId, game.whiteId);

    const { data: updated } = await gamesRepo.finishIfActive(gameId, {
        status: 'completed',
        winner_id: winnerId,
        ended_at: new Date().toISOString(),
        final_fen: game.fen ?? null,
    });

    if (!updated) return; // already finalized

    try {
        const ratingService = getRatingService();
        const changes = await ratingService.processGameEnd(
            gameId,
            game.whiteId,
            game.blackId,
            outcome,
            game.timeControl,
            game.isRated,
        );
        if (changes) emitter.toRoom(gameRoom(gameId), 'rating_updated', changes);
    } catch (e) {
        console.error('[clock] rating error:', /** @type {Error} */ (e).message);
    }
}

/**
 * @typedef {object} ClockVerdict
 * @property {'white' | 'black'} winnerColor
 * @property {string} reason 'Abandonment' | 'Time'
 * @property {object} payloadExtra extra `game_end` fields (kept from the original payloads)
 */

/**
 * Whether the clock ends `game` at `at`, and for whom. Pure. A disconnected
 * player's clock is paused; after the grace period the opponent wins by
 * abandonment. Otherwise the side to move loses when its time is up.
 * @param {GameState} game an active game whose clock has started
 * @param {number} at
 * @returns {ClockVerdict | null}
 */
function clockVerdict(game, at) {
    const disconnectInfo = /** @type {{ side: string, at: number } | null} */ (game.disconnectInfo);
    // ── Disconnect grace period check (20 s) ──
    if (disconnectInfo) {
        if (!isGraceExpired(disconnectInfo, at)) return null; // clock paused while opponent is disconnected
        return { winnerColor: opponentColor(disconnectInfo.side), reason: 'Abandonment', payloadExtra: {} };
    }
    // ── Clock timeout ──
    if (tickerSnapshot(game, at).remainingMs > 0) return null;
    return {
        winnerColor: opponentColor(sideToColor(game.activeSide)),
        reason: 'Time',
        payloadExtra: { is_rated: game.isRated, time_control: game.timeControl },
    };
}

/** @param {any} game */
const isRunning = (game) => Boolean(game && game.status === 'active' && game.lastMoveAt);

/**
 * End a game the clock has decided: Redis state, active set, broadcast, finalize.
 *
 * The verdict is taken again on the state read *inside* the per-game lock
 * (the same atomic active → completed transition gameFinalizer uses), not on
 * the tick's earlier read. A move, a reconnect or another ending that landed
 * in between therefore wins: the player who just reconnected is not
 * forfeited, and there is never a second, contradictory `game_end` (NODE-18).
 * @param {ClockDeps} deps
 * @param {string} gameId
 * @param {number} at
 */
async function endOnClock(deps, gameId, at) {
    /** @type {ClockVerdict | null} */
    let verdict = null;
    const finished = await deps.gameStore.mutateGame(gameId, (current) => {
        verdict = isRunning(current) ? clockVerdict(current, at) : null;
        return verdict ? { ...current, status: 'completed', result: verdict.winnerColor } : null;
    });
    if (!finished || !verdict) return; // the state moved on: nothing to end
    const { winnerColor, reason, payloadExtra } = /** @type {ClockVerdict} */ (verdict);
    await deps.gameStore.removeActiveGame(gameId);

    deps.emitter.toRoom(gameRoom(gameId), 'game_end', {
        game_id: gameId,
        result: resultLabel(winnerColor),
        reason,
        white_id: finished.whiteId,
        black_id: finished.blackId,
        ...payloadExtra,
    });
    const winnerId = playerIdOf(winnerColor, finished);
    await finalizeExpiredGame(deps, { gameId, game: finished, winnerId, reason: reason.toLowerCase() });
}

/**
 * One game's tick: broadcast the running clock, then end the game if the
 * clock says so (see `clockVerdict`).
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

    if (clockVerdict(game, at)) await endOnClock(deps, gameId, at);
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
        /** @param {{ gameId: string, game: GameState, winnerId: string | null, reason?: string }} p */
        finalizeExpiredGame: (p) => finalizeExpiredGame(deps, p),
    };
}

module.exports = { createClockService };
