/**
 * Full game-server instances over one real Redis, for the two-instance tests [MULTI-INSTANCE]
 * (TEST-06). Each instance is built from the same factories as src/index.js (game store with
 * the Lua compare-and-set, the Socket.IO Redis Streams adapter, the game service and the
 * finalizer). Only the database is faked: `db` records what every instance wrote.
 */
const http = require('node:http');
const Redis = require('ioredis');
const { io: ioClient } = require('socket.io-client');
const { defineRedisCommands } = require('../../src/clients/redisCommands');
const { createSocketAdapter } = require('../../src/clients/socketAdapter');
const { createGameStateRepository } = require('../../src/repositories/gameStateRepository');
const { createIoEmitter } = require('../../src/services/emitter');
const { createGameFinalizer } = require('../../src/services/gameFinalizer');
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { createSocketServer, registerSocketHandlers } = require('../../src/sockets');
const { createInitialGameState } = require('../../src/domain/gameState');

const result = (data, error = null) => Promise.resolve({ data, error });
const allowAll = () => ({ isAllowed: () => true, allowsRequest: () => true });

/**
 * @param {{ url: string, streamName: string, cleanups: Array<() => Promise<void>>,
 *   db: { finishCalls: object[], moveRows: object[], deletedMoves?: object[] } }} env
 */
function instanceFactory({ url, streamName, cleanups, db }) {
    function fakeRepos(name) {
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
        const movesRepo = {
            insert: (row) => (db.moveRows.push({ ...row, by: name }), result(null)),
            deleteAfter: (gameId, keep) => {
                db.moveRows = db.moveRows.filter((r) => r.game_id !== gameId || r.move_number <= keep);
                return result(null);
            },
        };
        return { gamesRepo, movesRepo };
    }

    return async function startInstance(name) {
        const redis = defineRedisCommands(new Redis(url, { maxRetriesPerRequest: 1 }));
        const adapter = createSocketAdapter(url, { streamName });
        const server = http.createServer();
        const io = createSocketServer(server, allowAll, { adapter: adapter.adapter });
        const emitter = createIoEmitter(io);
        const sessions = createSessionRegistry();
        const gameStore = createGameStateRepository(redis);
        const { gamesRepo, movesRepo } = fakeRepos(name);
        const ratingService = { processGameEnd: jest.fn(async () => null) };
        const reviewService = { triggerGameReview: jest.fn() };
        const finalizer = createGameFinalizer({
            gameStore,
            gamesRepo,
            ratingService,
            reviewService,
            sessions,
            emitter,
        });
        const deps = { gameStore, gamesRepo, movesRepo, ratingService, reviewService, sessions, emitter, finalizer };
        const gameService = createGameService(deps);
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
    };
}

/** A connected player socket on the instance at `url`. */
function connectPlayer(url, userId, cleanups) {
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

/** An active rated 10+0 game between alice (White) and bob (Black). */
async function seedGame(store, id, overrides = {}) {
    await store.setGame(id, {
        ...createInitialGameState({
            id,
            whiteId: 'alice',
            blackId: 'bob',
            timeControl: '10+0',
            isRated: true,
            startedAt: Date.now(),
        }),
        ...overrides,
    });
    await store.addActiveGame(id);
}

module.exports = { instanceFactory, connectPlayer, once, emitAck, seedGame };
