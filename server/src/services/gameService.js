// @ts-check
/**
 * Live game flow: joining, moves, resignation, disconnects and reconnects.
 * The handlers pass the validated payload, the verified user id and a
 * ClientPort.
 *
 * The server is the authority: moves are validated here (moveRecorder), the
 * position after each move is adjudicated here (domain/adjudication), and a
 * game ends only through gameFinalizer. Clients cannot report a result.
 * Clocks are persisted in one column pair, `white_clock_ms` / `black_clock_ms`
 * (G2): the same pair the restore reads.
 */
const { clocksAt, freezeClocks, isClockRunning, resumeClocks } = require('../domain/clock');
const { adjudicate, REASON } = require('../domain/adjudication');
const { gameStateFromRow } = require('../domain/gameState');
const { isParticipant, playerRejection, REJECTION } = require('../domain/moveAuthorization');
const { resultLabel, colorOfPlayer, opponentColor, outcomeOfRow } = require('../domain/result');
const { gameRoom } = require('./emitter');
const { createGameFinalizer } = require('./gameFinalizer');
const { createMoveRecorder } = require('./moveRecorder');

const DISCONNECT_TIMEOUT_SECONDS = 20;

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {import('./emitter').ClientPort} ClientPort
 * @typedef {import('../sockets/sessionRegistry').SessionRegistry} SessionRegistry
 */

/**
 * @typedef {object} GameServiceDeps
 * @property {{ getGame: Function, setGame: Function, mutateGame: Function, addActiveGame: Function,
 *   removeActiveGame: Function }} gameStore
 * @property {{ findForRestore: Function, updateById: Function, updateIfActive: Function,
 *   finishIfActive: Function }} gamesRepo
 * @property {{ insert: Function }} movesRepo
 * @property {{ processGameEnd: Function }} ratingService
 * @property {{ triggerGameReview: (gameId: string, moveLog: any, timeControl: unknown) => void }} reviewService
 * @property {Pick<SessionRegistry, 'userIdOf' | 'activeGameOf' | 'hasActiveGame' | 'setActiveGame' | 'clearGame'>} sessions
 * @property {Emitter} emitter
 * @property {ReturnType<typeof createGameFinalizer>} [finalizer] the shared finalizer; one is built when absent
 * @property {() => number} [now]
 */

/**
 * @typedef {GameServiceDeps & { now: () => number, moves: ReturnType<typeof createMoveRecorder>,
 *   finalizer: ReturnType<typeof createGameFinalizer> }} GameCtx
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
    if (dbGame && (dbGame.status === 'completed' || dbGame.status === 'aborted')) {
        client.emit('game_end', {
            game_id: gameId,
            result: resultLabel(outcomeOfRow(dbGame)),
            reason: 'Game over',
            white_id: dbGame.white_id,
            black_id: dbGame.black_id,
        });
    }
    return null;
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
    sendState(ctx, game, client);
}

/**
 * Send `client` the authoritative view of `game`: the result when it is over,
 * otherwise position, move log and clocks (`game_state_sync`).
 * @param {GameCtx} ctx
 * @param {any} game
 * @param {ClientPort} client
 */
function sendState(ctx, game, client) {
    // If game is already completed in Redis, notify joining client
    if (game.status === 'completed') {
        client.emit('game_end', {
            game_id: game.id,
            result: resultLabel(game.result),
            reason: game.reason || 'Game over',
            white_id: game.whiteId,
            black_id: game.blackId,
        });
        return;
    }

    // Real remaining time (frozen while a player is disconnected or before the first move).
    const { whiteMs, blackMs } = clocksAt(game, ctx.now());

    client.emit('game_state_sync', {
        fen: game.fen,
        moveLog: game.moveLog || [],
        whiteMs,
        blackMs,
        activeSide: game.activeSide,
        clockActive: isClockRunning(game),
        whiteId: game.whiteId,
        blackId: game.blackId,
    });
}

/**
 * A player connected again while in an active game: clear the disconnect
 * grace period. The check and the write are one atomic transition, so a move
 * or an ending that lands at the same moment is neither lost nor undone.
 * @param {GameCtx} ctx
 * @param {string} userId
 * @param {ClientPort} client
 */
async function reconnect({ gameStore, sessions, emitter, now }, userId, client) {
    const gameId = sessions.activeGameOf(userId);
    if (!gameId) return;
    const resumed = await gameStore.mutateGame(gameId, (/** @type {any} */ game) =>
        game && game.status === 'active' && game.disconnectInfo?.userId === userId
            ? { ...game, disconnectInfo: null, ...resumeClocks(game, now()) }
            : null,
    );
    if (!resumed) return;
    client.join(gameRoom(gameId));
    emitter.toRoom(gameRoom(gameId), 'opponent_reconnected', { userId });
    client.emit('clock_sync', { whiteMs: resumed.whiteClockMs, blackMs: resumed.blackClockMs });
}

/**
 * `make_move`: apply the move if it is the caller's legal move, then let the
 * server decide whether that move ended the game (checkmate, stalemate,
 * insufficient material, threefold repetition, fifty-move rule). Otherwise
 * tell the sender why (`move_rejected`) and resend the authoritative state so
 * its board snaps back. Nothing from the payload except `from`/`to`/`promotion`
 * is used.
 * @param {GameCtx} ctx
 * @param {import('./moveRecorder').MoveRequest} data
 * @param {string} userId the connection's verified user
 * @param {ClientPort} client
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function makeMove(ctx, data, userId, client) {
    const outcome = await ctx.moves.submit(data, userId);
    if (outcome.accepted) {
        const verdict = adjudicate(outcome.played.position);
        if (verdict) await ctx.finalizer.endGame(data.game_id, verdict);
        return { ok: true };
    }

    client.emit('move_rejected', { game_id: data.game_id, reason: outcome.reason });
    if (outcome.game) sendState(ctx, outcome.game, client);
    return { ok: false, error: outcome.reason };
}

/**
 * `resign`: the caller, an active participant, loses; the opponent wins by
 * Resignation. Allowed on either side's turn.
 * @param {GameCtx} ctx
 * @param {{ game_id: string }} data
 * @param {string} userId the connection's verified user
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function resign(ctx, { game_id: gameId }, userId) {
    const game = await ctx.gameStore.getGame(gameId);
    const reason = playerRejection(game, userId);
    if (reason) return { ok: false, error: reason };

    const winner = opponentColor(colorOfPlayer(userId, game.whiteId));
    const ended = await ctx.finalizer.endGame(gameId, { winner, reason: REASON.RESIGNATION });
    // Lost a race with another ending (mate, flag fall): that result stands.
    return ended ? { ok: true } : { ok: false, error: REJECTION.GAME_NOT_ACTIVE };
}

/**
 * After a socket of `userId` disconnected: freeze the clocks and start the
 * 20 s grace period (the global ticker adjudicates abandonment).
 *
 * The state is re-read inside the per-game lock and only an active game the
 * user plays in is touched, so a disconnect that overlaps a move keeps the
 * move, and one that overlaps the end of the game cannot make it active again.
 * @param {GameCtx} ctx
 * @param {string | undefined} userId
 */
async function handleDisconnect({ gameStore, gamesRepo, sessions, emitter, now }, userId) {
    if (!userId || !sessions.hasActiveGame(userId)) return;
    const gameId = /** @type {string} */ (sessions.activeGameOf(userId));
    const at = now();

    const frozen = await gameStore.mutateGame(gameId, (/** @type {any} */ game) => {
        // Defence in depth: a link is only ever created for a participant (see joinGame).
        if (!game || game.status !== 'active' || !isParticipant(game, userId)) return null;
        // Charge the time used so far once and stop the clocks (G9).
        const side = colorOfPlayer(userId, game.whiteId);
        return { ...game, ...freezeClocks(game, at), disconnectInfo: { userId, side, at } };
    });
    if (!frozen) return;

    // Persist clock snapshot to Supabase (fire-and-forget)
    gamesRepo
        .updateIfActive(gameId, {
            white_clock_ms: Math.round(frozen.whiteClockMs),
            black_clock_ms: Math.round(frozen.blackClockMs),
        })
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
    const finalizer = deps.finalizer ?? createGameFinalizer(deps);
    /** @type {GameCtx} */
    const ctx = { ...deps, now, moves: createMoveRecorder({ ...deps, now }), finalizer };
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
        /** @type {(data: import('./moveRecorder').MoveRequest, userId: string, client: ClientPort) => Promise<{ ok: boolean, error?: string }>} */
        makeMove: (data, userId, client) => makeMove(ctx, data, userId, client),
        /** @type {(data: { game_id: string }, userId: string) => Promise<{ ok: boolean, error?: string }>} */
        resign: (data, userId) => resign(ctx, data, userId),
        /** @type {(userId: string | undefined) => Promise<void>} */
        handleDisconnect: (userId) => handleDisconnect(ctx, userId),
    };
}

module.exports = { createGameService };
