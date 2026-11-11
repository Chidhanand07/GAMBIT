// @ts-check
/**
 * Live game flow: joining, moves, client-reported endings, disconnects and
 * reconnects. Moved out of the `server.js` socket handlers; the handlers now
 * only pass the payload, the socket id and a ClientPort.
 *
 * Known bugs kept on purpose (see the refactor playbook): the client FEN is
 * accepted when the engine is unreachable, `game_end` trusts the client's
 * result text, and the disconnect snapshot writes `white_time_ms`/`black_time_ms`.
 */
const { clocksAt } = require('../domain/clock');
const { gameStateFromRow } = require('../domain/gameState');
const { resultLabel, parseOutcome, colorOfPlayer, winnerIdFor } = require('../domain/result');
const { gameRoom } = require('./emitter');
const { createMoveRecorder } = require('./moveRecorder');

const DISCONNECT_TIMEOUT_SECONDS = 20;

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {import('./emitter').ClientPort} ClientPort
 * @typedef {import('../sockets/sessionRegistry').SessionRegistry} SessionRegistry
 */

/**
 * @typedef {object} GameServiceDeps
 * @property {{ getGame: Function, setGame: Function, updateGame: Function, addActiveGame: Function,
 *   removeActiveGame: Function }} gameStore
 * @property {{ findForRestore: Function, updateById: Function, updateIfActive: Function,
 *   finishIfActive: Function }} gamesRepo
 * @property {{ insert: Function }} movesRepo
 * @property {{ validateMove: (p: { fen: string, move: string }) => Promise<any> }} engineClient
 * @property {{ processGameEnd: Function }} ratingService
 * @property {{ triggerGameReview: (gameId: string, moveLog: any, timeControl: unknown) => void }} reviewService
 * @property {Pick<SessionRegistry, 'userIdOf' | 'activeGameOf' | 'hasActiveGame' | 'setActiveGame' | 'clearGame'>} sessions
 * @property {Emitter} emitter
 * @property {() => number} [now]
 */

/**
 * @typedef {GameServiceDeps & { now: () => number, moves: ReturnType<typeof createMoveRecorder> }} GameCtx
 */

/**
 * Redis state, or the DB row restored into Redis after a server restart. A game
 * completed in the DB is reported to `client` and yields null.
 * @param {GameCtx} ctx
 * @param {string} gameId
 * @param {ClientPort} client
 */
async function loadOrRestore({ gameStore, gamesRepo, now }, gameId, client) {
    const game = await gameStore.getGame(gameId);
    if (game) return game;

    // Server-restart fallback: restore from Supabase if Redis has no state
    const { data: dbGame } = await gamesRepo.findForRestore(gameId);
    if (dbGame && dbGame.status === 'active') {
        const restored = gameStateFromRow(gameId, dbGame, now());
        await gameStore.setGame(gameId, restored);
        await gameStore.addActiveGame(gameId);
        return restored;
    }
    if (dbGame && dbGame.status === 'completed') {
        client.emit('game_end', {
            game_id: gameId,
            result: resultLabel(dbGame.result),
            reason: 'Game over',
            white_id: dbGame.white_id,
            black_id: dbGame.black_id,
        });
    }
    return null;
}

/**
 * True when `userId` plays white or black in `game`.
 * @param {{ whiteId?: string | null, blackId?: string | null }} game
 * @param {string | undefined} userId
 */
function isParticipant(game, userId) {
    return Boolean(userId) && (userId === game.whiteId || userId === game.blackId);
}

/**
 * `join_game`: enter the room and send the current state (or the result of a
 * finished game). Only the white and black players are linked to the game;
 * the link is what lets a disconnect start the abandonment countdown, so
 * anyone else is a spectator: they see the game but can never affect it
 * (NODE-11).
 * @param {GameCtx} ctx
 * @param {string} gameId
 * @param {ClientPort} client
 * @param {string} userId the connection's verified user
 */
async function joinGame(ctx, gameId, client, userId) {
    client.join(gameRoom(gameId));

    const game = await loadOrRestore(ctx, gameId, client);
    if (!game) return;
    if (isParticipant(game, userId)) ctx.sessions.setActiveGame(userId, gameId);

    // If game is already completed in Redis, notify joining client
    if (game.status === 'completed') {
        client.emit('game_end', {
            game_id: gameId,
            result: resultLabel(game.result),
            reason: game.reason || 'Game over',
            white_id: game.whiteId,
            black_id: game.blackId,
        });
        return;
    }

    // Compute real remaining time for the active player
    // (clocks are frozen while a player is disconnected)
    const at = ctx.now();
    const { whiteMs, blackMs } = game.disconnectInfo
        ? { whiteMs: game.whiteClockMs, blackMs: game.blackClockMs }
        : clocksAt(game, at);

    client.emit('game_state_sync', {
        fen: game.fen,
        moveLog: game.moveLog || [],
        whiteMs,
        blackMs,
        activeSide: game.activeSide,
        clockActive: game.lastMoveAt !== null,
        whiteId: game.whiteId,
        blackId: game.blackId,
    });
}

/**
 * `authenticate` while in an active game: clear the disconnect grace period.
 * @param {GameCtx} ctx
 * @param {string} userId
 * @param {ClientPort} client
 */
async function reconnect({ gameStore, sessions, emitter, now }, userId, client) {
    const gameId = sessions.activeGameOf(userId);
    if (!gameId) return;
    const game = await gameStore.getGame(gameId);
    if (game && game.status === 'active' && game.disconnectInfo?.userId === userId) {
        await gameStore.setGame(gameId, { ...game, disconnectInfo: null, lastMoveAt: now() });
        client.join(gameRoom(gameId));
        emitter.toRoom(gameRoom(gameId), 'opponent_reconnected', { userId });
        client.emit('clock_sync', { whiteMs: game.whiteClockMs, blackMs: game.blackClockMs });
    }
}

/**
 * `make_move` from the player whose turn it is (C2). `data` is mutated and
 * re-broadcast, as before.
 * @param {GameCtx} ctx
 * @param {Record<string, any>} data
 * @param {string} socketId
 */
async function makeMove({ gameStore, sessions, moves }, data, socketId) {
    const game = await gameStore.getGame(data.game_id);
    if (!game || game.status !== 'active') return;

    // C2 fix: verify the moving socket is the player whose turn it is
    const movingUserId = sessions.userIdOf(socketId);
    const expectedId = game.activeSide === 'w' ? game.whiteId : game.blackId;
    if (!movingUserId || movingUserId !== expectedId) return;

    if (game.fen && data.move && !(await moves.validate(game, data))) return;

    await moves.apply(game, data);
}

/**
 * Time control and rated flag for rating: Redis state first, then the client payload.
 * @param {any} game
 * @param {Record<string, any>} data
 */
function settingsOf(game, data) {
    return {
        timeControl: game.timeControl ?? data.time_control ?? '10',
        isRated: game.isRated ?? data.is_rated ?? false,
    };
}

/**
 * Idempotent DB update, then review and rating for the call that won it.
 * @param {GameCtx} ctx
 * @param {{ data: Record<string, any>, game: any, outcome: 'white' | 'black' | 'draw' }} p
 */
async function finalize({ gamesRepo, reviewService, ratingService, emitter }, { data, game, outcome }) {
    const { whiteId, blackId } = game;
    // Idempotent DB update — only applies if game is still marked active
    const { data: updated } = await gamesRepo.finishIfActive(data.game_id, {
        status: 'completed',
        result: outcome === 'draw' ? 'draw' : null,
        winner_id: winnerIdFor(outcome, { whiteId, blackId }),
        ended_at: new Date().toISOString(),
        final_fen: game.fen ?? null,
        white_clock_ms: Math.round(game.whiteClockMs ?? 0),
        black_clock_ms: Math.round(game.blackClockMs ?? 0),
    });

    if (!updated) return;

    const { timeControl, isRated } = settingsOf(game, data);
    // Full Game Review in the engine (depth-18 Stockfish per move); fire-and-forget.
    reviewService.triggerGameReview(data.game_id, game.moveLog, timeControl);

    const changes = await ratingService.processGameEnd(data.game_id, whiteId, blackId, outcome, timeControl, isRated);
    if (changes) {
        emitter.toRoom(gameRoom(data.game_id), 'rating_updated', changes);
    }
}

/**
 * `game_end` reported by a client. Players come from Redis (C1); the result
 * text comes from the client.
 * @param {GameCtx} ctx
 * @param {Record<string, any>} data
 */
async function endGame(ctx, data) {
    // C1 fix: always read player IDs and game state from Redis — never trust client payload
    const game = await ctx.gameStore.getGame(data.game_id);
    if (!game || game.status !== 'active') return; // reject if not active or already ended

    const whiteId = game.whiteId;
    const blackId = game.blackId;
    if (!whiteId || !blackId) return;

    const outcome = parseOutcome(data.result);

    await ctx.gameStore.setGame(data.game_id, { ...game, status: 'completed', result: outcome });
    await ctx.gameStore.removeActiveGame(data.game_id);

    // Broadcast with server-verified player IDs
    ctx.emitter.toRoom(gameRoom(data.game_id), 'game_end', { ...data, white_id: whiteId, black_id: blackId });

    // Clean up active game tracking
    ctx.sessions.clearGame(data.game_id);

    await finalize(ctx, { data, game, outcome });
}

/**
 * After a socket of `userId` disconnected: freeze the clocks and start the
 * 20 s grace period (the global ticker adjudicates abandonment).
 * @param {GameCtx} ctx
 * @param {string | undefined} userId
 */
async function handleDisconnect({ gameStore, gamesRepo, sessions, emitter, now }, userId) {
    if (!userId || !sessions.hasActiveGame(userId)) return;
    const gameId = /** @type {string} */ (sessions.activeGameOf(userId));
    const game = await gameStore.getGame(gameId);
    if (!game || game.status !== 'active') return;
    // Defence in depth: a link is only ever created for a participant (see joinGame).
    if (!isParticipant(game, userId)) return;

    const at = now();
    // Snapshot the clock at disconnect time
    const { whiteMs: whiteClockMs, blackMs: blackClockMs } = clocksAt(game, at);
    const disconnectedSide = colorOfPlayer(userId, game.whiteId);

    await gameStore.setGame(gameId, {
        ...game,
        whiteClockMs,
        blackClockMs,
        disconnectInfo: { userId, side: disconnectedSide, at },
    });

    // Persist clock snapshot to Supabase (fire-and-forget)
    gamesRepo
        .updateIfActive(gameId, { white_time_ms: Math.round(whiteClockMs), black_time_ms: Math.round(blackClockMs) })
        .then(() => {});

    emitter.toRoom(gameRoom(gameId), 'opponent_disconnected', {
        userId,
        timeoutSeconds: DISCONNECT_TIMEOUT_SECONDS,
    });
}

/**
 * @param {GameServiceDeps} deps
 */
function createGameService(deps) {
    const now = deps.now ?? (() => Date.now());
    /** @type {GameCtx} */
    const ctx = { ...deps, now, moves: createMoveRecorder({ ...deps, now }) };
    return {
        /** @type {(gameId: string, client: ClientPort, userId: string) => Promise<void>} */
        joinGame: (gameId, client, userId) => joinGame(ctx, gameId, client, userId),
        /**
         * `spectate_game`: join the room only if the game exists (H8).
         * @type {(gameId: string, client: ClientPort) => Promise<void>}
         */
        spectate: async (gameId, client) => {
            const game = await deps.gameStore.getGame(gameId);
            if (!game) return;
            client.join(gameRoom(gameId));
        },
        /** @type {(userId: string, client: ClientPort) => Promise<void>} */
        reconnect: (userId, client) => reconnect(ctx, userId, client),
        /** @type {(data: Record<string, any>, socketId: string) => Promise<void>} */
        makeMove: (data, socketId) => makeMove(ctx, data, socketId),
        /** @type {(data: Record<string, any>) => Promise<void>} */
        endGame: (data) => endGame(ctx, data),
        /** @type {(userId: string | undefined) => Promise<void>} */
        handleDisconnect: (userId) => handleDisconnect(ctx, userId),
    };
}

module.exports = { createGameService };
