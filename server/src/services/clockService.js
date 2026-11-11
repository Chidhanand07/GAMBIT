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
 * End a game won by `winnerColor`: Redis state, active set, broadcast, finalize.
 * The active → completed transition is atomic and shared with gameFinalizer,
 * so a flag fall that races a mate or a resignation cannot produce a second,
 * contradictory `game_end` (NODE-18).
 * @param {ClockDeps} deps
 * @param {{ gameId: string, game: GameState, winnerColor: 'white' | 'black', reason: string,
 *   payloadExtra: object }} p
 */
async function endOnClock(deps, { gameId, game, winnerColor, reason, payloadExtra }) {
    const winnerId = playerIdOf(winnerColor, game);
    const result = resultLabel(winnerColor);

    const finished = await deps.gameStore.mutateGame(gameId, (current) =>
        current && current.status === 'active' ? { ...current, status: 'completed', result: winnerColor } : null,
    );
    if (!finished) return; // another ending won the race
    await deps.gameStore.removeActiveGame(gameId);

    deps.emitter.toRoom(gameRoom(gameId), 'game_end', {
        game_id: gameId,
        result,
        reason,
        white_id: game.whiteId,
        black_id: game.blackId,
        ...payloadExtra,
    });
    await finalizeExpiredGame(deps, { gameId, game, winnerId, reason: reason.toLowerCase() });
}

/**
 * One game's tick. A disconnected player's clock is paused; after the grace
 * period the opponent wins by abandonment.
 * @param {ClockDeps} deps
 * @param {string} gameId
 */
async function tickGame(deps, gameId) {
    const game = await deps.gameStore.getGame(gameId);
    if (!game || game.status !== 'active' || !game.lastMoveAt) return;

    const at = deps.now();
    // Real remaining for the active player
    const { remainingMs: remaining, whiteMs, blackMs } = tickerSnapshot(game, at);

    deps.emitter.toRoom(gameRoom(gameId), 'clock_sync', { whiteMs, blackMs, serverTs: at });

    // ── Disconnect grace period check (20 s) ──
    if (game.disconnectInfo) {
        if (isGraceExpired(game.disconnectInfo, at)) {
            const winnerColor = opponentColor(game.disconnectInfo.side);
            await endOnClock(deps, { gameId, game, winnerColor, reason: 'Abandonment', payloadExtra: {} });
        }
        return; // clock paused while opponent is disconnected
    }

    // ── Clock timeout ──
    if (remaining <= 0) {
        const winnerColor = opponentColor(sideToColor(game.activeSide));
        const payloadExtra = { is_rated: game.isRated, time_control: game.timeControl };
        await endOnClock(deps, { gameId, game, winnerColor, reason: 'Time', payloadExtra });
    }
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
