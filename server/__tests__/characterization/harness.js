/**
 * Shared black-box harness for the characterization suite (PR 02).
 *
 * These tests pin the CURRENT observable behaviour of the realtime server and
 * HTTP API (including known bugs) so the layered rewrite can prove it changed
 * nothing. They only touch the seams listed in the refactor playbook:
 *   - require('../../server') → { app, server, io, matchmaking }
 *   - the mocked modules ../../supabase, ../../lib/redis (and ../../services/rating
 *     in files that mock it), ../../lib/gameStore, global.fetch
 *   - socket.io-client / supertest
 *
 * Every test file must declare its own jest.mock() calls (they are hoisted per
 * file); this module then picks up the mocked instances through the registry.
 */
const { io: ioClient } = require('socket.io-client');
const { supabase } = require('../../supabase');
const redis = require('../../lib/redis');
const { setGame, addActiveGame } = require('../../lib/gameStore');
const { makeGame, START_FEN } = require('../helpers/fixtures');

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const DEFAULT_ENGINE = 'http://localhost:8001';
const EVENT_TIMEOUT_MS = 1000;
/** Matchmaking and the global clock tick every 1000 ms of real time. */
const TICK_TIMEOUT_MS = 2500;
const SETTLE_MS = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve with the next `event` payload on `socket`, or reject after `timeout`. */
function once(socket, event, timeout = EVENT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout);
        socket.once(event, (...args) => {
            clearTimeout(timer);
            resolve(args.length > 1 ? args : args[0]);
        });
    });
}

const POLL_MS = 10;

/**
 * Poll `predicate` (sync or async) until truthy, or reject after ~`timeout` ms.
 * Counts iterations instead of reading Date.now(), so it works while tests mock the clock.
 */
async function waitFor(predicate, timeout = TICK_TIMEOUT_MS, label = 'condition') {
    for (let waited = 0; !(await predicate()); waited += POLL_MS) {
        if (waited > timeout) throw new Error(`timed out waiting for ${label}`);
        await sleep(POLL_MS);
    }
}

/** Collect every payload of `event` received by `socket` (for "did NOT happen" checks). */
function record(socket, event) {
    const got = [];
    socket.on(event, (payload) => got.push(payload));
    return got;
}

/** Collect every event name + payload a socket receives. */
function recordAll(socket) {
    const got = [];
    socket.onAny((event, ...args) => got.push([event, ...args]));
    return got;
}

/** Default engine double: every move is legal and produces AFTER_E4. */
async function defaultEngine(url) {
    return {
        ok: true,
        status: 200,
        json: async () => (String(url).endsWith('/validate-move') ? { valid: true, new_fen: AFTER_E4 } : {}),
    };
}

/** Recorded ops of every Supabase call against `table`. */
function opsFor(table) {
    return supabase.callsFor(table).map((c) => c.ops);
}

/** PostgREST ignores whitespace in select lists; normalise multi-line selects. */
function compact(selectList) {
    return String(selectList).replace(/\s+/g, '');
}

const TOKEN_PREFIX = 'test-token:';
/** The fake access token the mocked Supabase Auth resolves to `userId`. */
const tokenFor = (userId) => `${TOKEN_PREFIX}${userId}`;

/** Stand-in for Supabase `auth.getUser(token)`: only `tokenFor(...)` tokens verify. */
async function verifyTestToken(token) {
    return typeof token === 'string' && token.startsWith(TOKEN_PREFIX)
        ? { data: { user: { id: token.slice(TOKEN_PREFIX.length) } }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } };
}

let idCounter = 0;
/** Unique id per test so in-memory maps inside server.js never leak between tests. */
function uniqueId(prefix) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

/**
 * Registers beforeAll/afterAll/beforeEach/afterEach hooks that boot the real
 * server on an ephemeral port and reset the mocks between tests.
 *
 * @returns {object} ctx with url, app, server, io, matchmaking, fetch (spy),
 *   open(auth), connect(userId, prepare), seatedGame(overrides)
 */
function useServer() {
    const ctx = { clients: [] };
    const savedEnv = {};

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        Object.assign(ctx, require('../../server'));
        await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
        ctx.url = `http://127.0.0.1:${ctx.server.address().port}`;
        for (const k of ['GAMBIT_ENGINE_URL', 'ENGINE_URL', 'FRONTEND_URL']) savedEnv[k] = process.env[k];
    });

    afterAll(async () => {
        ctx.matchmaking.destroy();
        require('../../services/clock').stopGlobalClock();
        await new Promise((resolve) => ctx.io.close(resolve));
        for (const [k, v] of Object.entries(savedEnv)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    beforeEach(() => {
        delete process.env.GAMBIT_ENGINE_URL;
        delete process.env.ENGINE_URL;
        delete process.env.FRONTEND_URL;
        supabase.reset();
        redis._reset();
        ctx.matchmaking.queue.clear();
        supabase.auth.getUser.mockImplementation(verifyTestToken);
        ctx.fetch = jest.spyOn(global, 'fetch').mockImplementation(defaultEngine);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        while (ctx.clients.length) ctx.clients.pop().disconnect();
        await sleep(SETTLE_MS); // let server-side disconnect handlers finish
        jest.restoreAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    /** A client that has not finished its handshake yet; `auth` is sent as `handshake.auth`. */
    ctx.open = (auth) => {
        const socket = ioClient(ctx.url, { transports: ['websocket'], forceNew: true, reconnection: false, auth });
        ctx.clients.push(socket);
        return socket;
    };

    /**
     * Connect a client whose handshake token verifies as `userId` (a fresh
     * stranger when omitted). `prepare(socket)` runs before the connection is
     * established, to attach listeners for events the server sends on connect.
     */
    ctx.connect = async (userId = uniqueId('stranger'), prepare = () => {}) => {
        const socket = ctx.open({ token: tokenFor(userId) });
        prepare(socket);
        // Generous: the handshake now includes an (async) token check, and suites run in parallel.
        await once(socket, 'connect', TICK_TIMEOUT_MS);
        return socket;
    };

    /** Put a game in Redis + the active set, and seat both players in its room. */
    ctx.seatedGame = async (overrides = {}) => {
        const game = makeGame({ id: uniqueId('game'), ...overrides });
        await setGame(game.id, game);
        await addActiveGame(game.id);
        const white = await ctx.connect(game.whiteId);
        const black = await ctx.connect(game.blackId);
        white.emit('join_game', game.id);
        black.emit('join_game', game.id);
        await Promise.all([once(white, 'game_state_sync'), once(black, 'game_state_sync')]);
        return { game, white, black };
    };

    return ctx;
}

module.exports = {
    AFTER_E4,
    START_FEN,
    ISO_DATE,
    DEFAULT_ENGINE,
    TICK_TIMEOUT_MS,
    makeGame,
    sleep,
    waitFor,
    once,
    record,
    recordAll,
    opsFor,
    compact,
    uniqueId,
    tokenFor,
    useServer,
};
