/**
 * Two game-server instances behind one Redis play a full game [MULTI-INSTANCE] (TEST-06).
 *
 * Each instance is built from the same factories as src/index.js (game store with the Lua
 * compare-and-set, the Socket.IO Redis Streams adapter, the clock's tick lock, the game service
 * and finalizer). Only the database is faked. White connects to instance A, Black to instance B.
 * Runs against a real Redis when one is available (REDIS_TEST_URL in CI, or a local
 * redis-server); otherwise it is skipped with a message.
 */
const http = require('node:http');
const Redis = require('ioredis');
const { io: ioClient } = require('socket.io-client');
const { startRealRedis } = require('../helpers/realRedis');
const { defineRedisCommands } = require('../../src/clients/redisCommands');
const { createSocketAdapter } = require('../../src/clients/socketAdapter');
const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');
const { createIoEmitter } = require('../../src/services/emitter');
const { createGameFinalizer } = require('../../src/services/gameFinalizer');
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { createSocketServer, registerSocketHandlers } = require('../../src/sockets');
const { createInitialGameState } = require('../../src/domain/gameState');

let redisServer;
const cleanups = [];
/** The database both instances write to: what matters is that the game is finished once. */
const db = { finishCalls: [], moveRows: [] };
const result = (data, error = null) => Promise.resolve({ data, error });
const allowAll = () => ({ isAllowed: () => true, allowsRequest: () => true });

beforeAll(async () => {
    redisServer = await startRealRedis();
});
afterAll(async () => {
    for (const fn of cleanups.reverse()) await fn();
    await redisServer?.stop();
});

async function startInstance(name) {
    const redis = defineRedisCommands(new Redis(redisServer.url, { maxRetriesPerRequest: 1 }));
    const adapter = createSocketAdapter(redisServer.url);
    const server = http.createServer();
    const io = createSocketServer(server, allowAll, { adapter: adapter.adapter });
    const emitter = createIoEmitter(io);
    const sessions = createSessionRegistry();
    const gameStore = createGameStateRepository(redis);
    const gamesRepo = {
        findForRestore: () => result(null),
        updateById: () => result(null),
        updateIfActive: () => result(null),
        finishIfActive: (id, row) => {
            const won = !db.finishCalls.some((c) => c.id === id);
            db.finishCalls.push({ id, by: name, row });
            return result(won ? { id } : null);
        },
    };
    const movesRepo = { insert: (row) => (db.moveRows.push({ ...row, by: name }), result(null)) };
    const ratingService = { processGameEnd: jest.fn(async () => null) };
    const reviewService = { triggerGameReview: jest.fn() };
    const finalizer = createGameFinalizer({ gameStore, gamesRepo, ratingService, reviewService, sessions, emitter });
    const gameService = createGameService({
        gameStore,
        gamesRepo,
        movesRepo,
        ratingService,
        reviewService,
        sessions,
        emitter,
        finalizer,
    });
    const noop = jest.fn(async () => ({ ok: true }));
    registerSocketHandlers(io, {
        sessions,
        matchmaking: { requestMatch: noop, leaveQueue: jest.fn(), leaveQueueBySocket: jest.fn() },
        gameService,
        chatService: { sendMessage: noop },
        socialService: {
            requestRematch: noop,
            acceptRematch: noop,
            declineRematch: noop,
            requestChallenge: noop,
            acceptChallenge: noop,
            declineChallenge: noop,
        },
        verifyToken: async (token) => token.replace(/^token:/, ''),
        tokenDeadline: () => Date.now() + 3_600_000,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
        await io.close();
        await adapter.close();
        await redis.quit();
    });
    return { name, io, gameStore, ratingService, url: `http://127.0.0.1:${server.address().port}` };
}

function player(url, userId) {
    return new Promise((resolve, reject) => {
        const socket = ioClient(url, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
            auth: { token: `token:${userId}` },
        });
        cleanups.push(async () => socket.disconnect());
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

const once = (socket, event, ms = 4000) =>
    new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
        socket.once(event, (payload) => (clearTimeout(t), resolve(payload)));
    });
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const maybe = (name, fn) =>
    test(
        name,
        async () => {
            if (!redisServer) {
                console.warn(`skipped (no redis-server binary and no REDIS_TEST_URL): ${name}`);
                return;
            }
            await fn();
        },
        30000,
    );

async function seed(store, id) {
    await store.setGame(
        id,
        createInitialGameState({
            id,
            whiteId: 'alice',
            blackId: 'bob',
            timeControl: '10+0',
            isRated: true,
            startedAt: Date.now(),
        }),
    );
    await store.addActiveGame(id);
}

maybe('a full game across two instances: every move reaches both players, mate is decided once', async () => {
    const a = await startInstance('A');
    const b = await startInstance('B');
    await seed(a.gameStore, 'g-full');

    const white = await player(a.url, 'alice');
    const black = await player(b.url, 'bob');
    const synced = [once(white, 'game_state_sync'), once(black, 'game_state_sync')];
    white.emit('join_game', 'g-full');
    black.emit('join_game', 'g-full');
    await Promise.all(synced);

    const seenByWhite = [];
    const seenByBlack = [];
    white.on('move_made', (m) => seenByWhite.push(m.san));
    black.on('move_made', (m) => seenByBlack.push(m.san));
    const endW = once(white, 'game_end', 8000);
    const endB = once(black, 'game_end', 8000);

    // Fool's mate: 1. f3 e5 2. g4 Qh4#
    expect(await emitAck(white, 'make_move', { game_id: 'g-full', from: 'f2', to: 'f3' })).toEqual({ ok: true });
    expect(await emitAck(black, 'make_move', { game_id: 'g-full', from: 'e7', to: 'e5' })).toEqual({ ok: true });
    expect(await emitAck(white, 'make_move', { game_id: 'g-full', from: 'g2', to: 'g4' })).toEqual({ ok: true });
    expect(await emitAck(black, 'make_move', { game_id: 'g-full', from: 'd8', to: 'h4' })).toEqual({ ok: true });

    const [w, bl] = await Promise.all([endW, endB]);
    expect(w).toMatchObject({ result: 'Black wins', reason: 'Checkmate' });
    expect(bl).toEqual(w);
    await new Promise((r) => setTimeout(r, 300));
    expect(seenByWhite).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(seenByBlack).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(db.finishCalls.filter((c) => c.id === 'g-full')).toHaveLength(1);
    expect((await b.gameStore.getGame('g-full')).status).toBe('completed');
});

maybe('the same player sends the same move to both instances at once: it is applied once', async () => {
    const a = await startInstance('A2');
    const b = await startInstance('B2');
    await seed(a.gameStore, 'g-race');
    const whiteOnA = await player(a.url, 'alice');
    const whiteOnB = await player(b.url, 'alice');
    await Promise.all([emitAck(whiteOnA, 'join_game', 'g-race'), emitAck(whiteOnB, 'join_game', 'g-race')]);

    const acks = await Promise.all([
        emitAck(whiteOnA, 'make_move', { game_id: 'g-race', from: 'e2', to: 'e4' }),
        emitAck(whiteOnB, 'make_move', { game_id: 'g-race', from: 'e2', to: 'e4' }),
    ]);
    expect(acks.filter((x) => x.ok)).toHaveLength(1);
    expect(acks.find((x) => !x.ok)).toEqual({ ok: false, error: 'not_your_turn' });
    const state = await a.gameStore.getGame('g-race');
    expect(state.moveLog).toHaveLength(1);
    expect(db.moveRows.filter((r) => r.game_id === 'g-race')).toHaveLength(1);
});

maybe('resign on one instance while a mating move lands on the other: one ending only', async () => {
    const a = await startInstance('A3');
    const b = await startInstance('B3');
    await seed(a.gameStore, 'g-end');
    const white = await player(a.url, 'alice');
    const black = await player(b.url, 'bob');
    await Promise.all([emitAck(white, 'join_game', 'g-end'), emitAck(black, 'join_game', 'g-end')]);
    for (const [who, from, to] of [
        [white, 'f2', 'f3'],
        [black, 'e7', 'e5'],
        [white, 'g2', 'g4'],
    ]) {
        await emitAck(who, 'make_move', { game_id: 'g-end', from, to });
    }
    const [mate, resign] = await Promise.all([
        emitAck(black, 'make_move', { game_id: 'g-end', from: 'd8', to: 'h4' }),
        emitAck(white, 'resign', { game_id: 'g-end' }),
    ]);
    expect([mate.ok, resign.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(db.finishCalls.filter((c) => c.id === 'g-end')).toHaveLength(1);
});
