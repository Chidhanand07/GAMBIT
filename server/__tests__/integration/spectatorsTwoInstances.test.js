/**
 * Spectator counts across two game-server instances behind one real Redis [F-130] (TEST-06).
 *
 * Each instance is built from the same factories as src/index.js (game store with the Lua
 * compare-and-set, spectators repository and service, Socket.IO Redis Streams adapter). The
 * players sit on instance A; spectators come in on A and B. The count is one shared number,
 * every change reaches the players on the other instance, and a crashed instance's spectators
 * lapse and are pruned by the survivor. Skipped with a message without a real Redis.
 */
const http = require('node:http');
const Redis = require('ioredis');
const { io: ioClient } = require('socket.io-client');
const { startRealRedis, uniqueNamespace } = require('../helpers/realRedis');
const { defineRedisCommands } = require('../../src/clients/redisCommands');
const { createSocketAdapter } = require('../../src/clients/socketAdapter');
const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');
const { createSpectatorsRepository } = require('../../src/repositories/spectatorsRepository');
const { createIoEmitter } = require('../../src/services/emitter');
const { createGameService } = require('../../src/services/gameService');
const { createSpectatorService } = require('../../src/services/spectatorService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { createSocketServer, registerSocketHandlers } = require('../../src/sockets');
const { createInitialGameState } = require('../../src/domain/gameState');

const NS = uniqueNamespace('spectators-two');
const TTL_MS = 1500;
let redisServer;
const cleanups = [];
const result = (data, error = null) => Promise.resolve({ data, error });
const allowAll = () => ({ isAllowed: () => true, allowsRequest: () => true });

beforeAll(async () => {
    redisServer = await startRealRedis();
});
afterAll(async () => {
    for (const fn of cleanups.reverse()) await fn();
    await redisServer?.stop();
});

async function startInstance() {
    const redis = defineRedisCommands(new Redis(redisServer.url, { maxRetriesPerRequest: 1 }));
    const adapter = createSocketAdapter(redisServer.url, { streamName: `${NS}:stream` });
    const server = http.createServer();
    const io = createSocketServer(server, allowAll, { adapter: adapter.adapter });
    const emitter = createIoEmitter(io);
    const sessions = createSessionRegistry();
    const gameStore = createGameStateRepository(redis);
    const spectatorService = createSpectatorService({
        repo: createSpectatorsRepository(redis, { namespace: NS, ttlMs: TTL_MS }),
        emitter,
    });
    const noop = jest.fn(async () => ({ ok: true }));
    const gameService = createGameService({
        gameStore,
        gamesRepo: { findForRestore: () => result(null), updateIfActive: () => result(null) },
        movesRepo: { insert: () => result(null) },
        ratingService: { processGameEnd: noop },
        reviewService: { triggerGameReview: jest.fn() },
        sessions,
        emitter,
        spectators: spectatorService,
    });
    registerSocketHandlers(io, {
        sessions,
        matchmaking: { requestMatch: noop, leaveQueue: jest.fn(), leaveQueueBySocket: jest.fn() },
        gameService,
        chatService: { sendMessage: noop },
        socialService: {},
        spectatorService,
        verifyToken: async (token) => token.replace(/^token:/, ''),
        tokenDeadline: () => Date.now() + 3_600_000,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const close = async () => {
        await io.close();
        await adapter.close();
        await redis.quit();
    };
    let closed = false;
    cleanups.push(async () => {
        if (!closed) await close();
    });
    return {
        gameStore,
        spectatorService,
        url: `http://127.0.0.1:${server.address().port}`,
        /** Stop serving without telling anyone: no disconnect cleanup reaches Redis (a crash). */
        async crash() {
            closed = true;
            redis.disconnect();
            await adapter.close().catch(() => {});
            io.close();
        },
    };
}

function client(url, userId) {
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
/** Wait until `count` is announced to `socket` (earlier announcements are skipped). */
const announced = (socket, count, ms = 5000) =>
    new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`count ${count} never announced`)), ms);
        const listener = (p) => {
            if (p.count !== count) return;
            clearTimeout(t);
            socket.off('spectators_changed', listener);
            resolve(p);
        };
        socket.on('spectators_changed', listener);
    });

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
        createInitialGameState({ id, whiteId: 'alice', blackId: 'bob', timeControl: '10+0', isRated: true, startedAt: Date.now() }),
    );
}

maybe('spectators on both instances share one count; changes reach players on the other instance', async () => {
    const a = await startInstance();
    const b = await startInstance();
    const game = `${NS}-shared`;
    await seed(a.gameStore, game);

    const white = await client(a.url, 'alice');
    const sync = once(white, 'game_state_sync');
    white.emit('join_game', game);
    expect(await sync).toMatchObject({ spectators: 0 });

    const viewerB = await client(b.url, 'carol');
    const one = announced(white, 1);
    viewerB.emit('join_game', game);
    expect(await once(viewerB, 'game_state_sync')).toMatchObject({ spectators: 1 });
    await one;

    // A second tab of the same viewer, on the other instance: still one watcher.
    const viewerB2 = await client(a.url, 'carol');
    viewerB2.emit('join_game', game);
    expect(await once(viewerB2, 'game_state_sync')).toMatchObject({ spectators: 1 });

    const viewerA = await client(a.url, 'dave');
    const two = announced(white, 2);
    viewerA.emit('join_game', game);
    await two;

    // The lobby question, asked on either instance, gets the same answer.
    expect(await emitAck(viewerB, 'spectator_counts', { game_ids: [game] })).toEqual({ ok: true, counts: { [game]: 2 } });
    expect(await emitAck(white, 'spectator_counts', { game_ids: [game] })).toEqual({ ok: true, counts: { [game]: 2 } });

    const back = announced(white, 1);
    viewerA.disconnect();
    await back;
    expect(await emitAck(viewerB, 'leave_game', game)).toEqual({ ok: true });
    viewerB2.disconnect();
    await announced(white, 0);
});

maybe('a crashed instance: its spectators lapse after the TTL and the survivor announces the drop', async () => {
    const a = await startInstance();
    const b = await startInstance();
    const game = `${NS}-crash`;
    await seed(a.gameStore, game);

    const white = await client(a.url, 'alice');
    white.emit('join_game', game);
    await once(white, 'game_state_sync');
    const viewerA = await client(a.url, 'erin');
    viewerA.emit('join_game', game);
    await announced(white, 1);
    const viewerB = await client(b.url, 'frank');
    viewerB.emit('join_game', game);
    await announced(white, 2);

    await b.crash(); // B's viewer is never removed by B
    const drop = announced(white, 1, 8000);
    await new Promise((r) => setTimeout(r, TTL_MS + 100));
    await a.spectatorService.heartbeat(); // A keeps erin alive and prunes frank
    await drop;
    expect(await emitAck(white, 'spectator_counts', { game_ids: [game] })).toEqual({ ok: true, counts: { [game]: 1 } });
});
