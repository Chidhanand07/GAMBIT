/**
 * server/server.js — real-time game flow over a real Socket.IO server:
 * turn enforcement, move validation, clocks and increment, game end,
 * chat, reconnect/disconnect, and restoring a game after a server restart.
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());
jest.mock('../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { io: ioClient } = require('socket.io-client');
const { supabase } = require('../supabase');
const redis = require('../lib/redis');
const rating = require('../services/rating');
const { setGame, getGame, addActiveGame, getActiveGameIds } = require('../lib/gameStore');
const { makeGame, START_FEN } = require('./helpers/fixtures');

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

let server, io, matchmaking, url;
const clients = [];

beforeAll(async () => {
    // The engine client refuses to call the engine without its shared secret (ENG-AUTH).
    process.env.ENGINE_SHARED_SECRET = 'test-engine-secret';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    ({ server, io, matchmaking } = require('../server'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    matchmaking.destroy();
    require('../services/clock').stopGlobalClock();
    await new Promise(resolve => io.close(resolve));
});

let fetchMock;
beforeEach(() => {
    supabase.reset();
    supabase.auth.getUser.mockImplementation(verifyTestToken);
    redis._reset();
    rating.processGameEnd.mockClear();
    // Default engine: every move is legal and produces AFTER_E4.
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (u) => ({
        ok: true,
        json: async () => (String(u).endsWith('/validate-move') ? { valid: true, new_fen: AFTER_E4 } : {}),
    }));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    while (clients.length) clients.pop().disconnect();
    await sleep(30); // let server-side disconnect handlers finish
    jest.restoreAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function once(socket, event, timeout = 1000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout);
        socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
    });
}

/** Collect every `event` a socket receives, for asserting something did NOT happen. */
function record(socket, event) {
    const got = [];
    socket.on(event, (p) => got.push(p));
    return got;
}

const TOKEN_PREFIX = 'test-token:';

/** Stand-in for Supabase Auth: `test-token:<id>` verifies as user `<id>`; anything else is invalid. */
async function verifyTestToken(token) {
    return typeof token === 'string' && token.startsWith(TOKEN_PREFIX)
        ? { data: { user: { id: token.slice(TOKEN_PREFIX.length) } }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } };
}

/** A client that has not finished its handshake; `auth` is sent as `handshake.auth`. */
function open(auth) {
    const socket = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth });
    clients.push(socket);
    return socket;
}

/** Connect with a handshake token that verifies as `userId`. */
async function connect(userId) {
    const socket = open({ token: `${TOKEN_PREFIX}${userId}` });
    await once(socket, 'connect');
    return socket;
}

async function seatedGame(gameOverrides = {}) {
    const game = makeGame(gameOverrides);
    await setGame(game.id, game);
    await addActiveGame(game.id);
    const white = await connect(game.whiteId);
    const black = await connect(game.blackId);
    white.emit('join_game', game.id);
    black.emit('join_game', game.id);
    await Promise.all([once(white, 'game_state_sync'), once(black, 'game_state_sync')]);
    return { game, white, black };
}

describe('joining a game', () => {
    test('join_game sends the current position and clocks', async () => {
        await setGame('game-1', makeGame({ whiteClockMs: 300000, blackClockMs: 290000 }));
        const s = await connect('white-user');
        s.emit('join_game', 'game-1');
        const sync = await once(s, 'game_state_sync');
        expect(sync).toEqual({
            fen: START_FEN, moveLog: [], whiteMs: 300000, blackMs: 290000,
            activeSide: 'w', clockActive: false, whiteId: 'white-user', blackId: 'black-user',
        });
    });

    test('a joining client sees the running clock already counted down', async () => {
        await setGame('game-1', makeGame({ lastMoveAt: Date.now() - 5000, activeSide: 'b', blackClockMs: 60000 }));
        const s = await connect('black-user');
        s.emit('join_game', 'game-1');
        const sync = await once(s, 'game_state_sync');
        expect(sync.blackMs).toBeLessThanOrEqual(55100);
        expect(sync.blackMs).toBeGreaterThan(54000);
        expect(sync.clockActive).toBe(true);
    });

    test('joining a finished game reports the result instead of a board', async () => {
        await setGame('game-1', makeGame({ status: 'completed', result: 'black', reason: 'Resignation' }));
        const s = await connect('white-user');
        s.emit('join_game', 'game-1');
        await expect(once(s, 'game_end')).resolves.toMatchObject({ result: 'Black wins', reason: 'Resignation' });
    });

    test('after a server restart, an active game is restored from the database', async () => {
        supabase.queue('games', {
            data: {
                id: 'game-9', status: 'active', white_id: 'w', black_id: 'b', is_rated: true,
                time_control: '5+3', fen: AFTER_E4, white_clock_ms: 250000, black_clock_ms: 280000,
            },
            error: null,
        });
        const s = await connect('w');
        s.emit('join_game', 'game-9');
        const sync = await once(s, 'game_state_sync');
        expect(sync).toMatchObject({ fen: AFTER_E4, activeSide: 'b', whiteId: 'w', blackId: 'b' });

        const restored = await getGame('game-9');
        expect(restored).toMatchObject({ whiteClockMs: 250000, blackClockMs: 280000, incrementMs: 3000, isRated: true });
        expect(await getActiveGameIds()).toContain('game-9');
    });

    test('after a server restart, a completed game reports its result', async () => {
        supabase.queue('games', { data: { id: 'g', status: 'completed', result: 'white', white_id: 'w', black_id: 'b' }, error: null });
        const s = await connect('w');
        s.emit('join_game', 'g');
        await expect(once(s, 'game_end')).resolves.toMatchObject({ result: 'White wins' });
    });
});

describe('making moves', () => {
    test('the player to move can move; both players receive it with clocks', async () => {
        const { white, black } = await seatedGame();
        const seenByBlack = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4', san: 'e4', fen: 'client-fen-ignored' });

        const move = await seenByBlack;
        expect(move).toMatchObject({ move: 'e2e4', san: 'e4', fen: AFTER_E4, whiteMs: 600000, blackMs: 600000 });

        const state = await getGame('game-1');
        expect(state).toMatchObject({ fen: AFTER_E4, activeSide: 'b' });
        expect(state.moveLog).toEqual([{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }]);
        expect(state.lastMoveAt).toEqual(expect.any(Number));
    });

    test('the server computes the FEN itself; the one the client sent is ignored [S1]', async () => {
        const { white, black } = await seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4', san: 'e4', fen: '8/8/8/8/8/8/8/K6k w - - 0 1' });
        expect((await p).fen).toBe(AFTER_E4);
    });

    test('moving out of turn is ignored', async () => {
        const { white, black } = await seatedGame();
        const moves = record(white, 'move_made');
        black.emit('make_move', { game_id: 'game-1', from: 'e7', to: 'e5' });
        await sleep(100);
        expect(moves).toHaveLength(0);
        expect((await getGame('game-1')).activeSide).toBe('w');
    });

    test('a spectator or stranger cannot move for a player', async () => {
        const { white } = await seatedGame();
        const stranger = await connect('stranger');
        const moves = record(white, 'move_made');
        stranger.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4' });
        await sleep(100);
        expect(moves).toHaveLength(0);
    });

    test('an unauthenticated socket cannot even connect, so it cannot move [S2]', async () => {
        const { white } = await seatedGame();
        const moves = record(white, 'move_made');
        const anon = open(undefined);
        const refused = await once(anon, 'connect_error');
        expect(refused.message).toBe('unauthorized');
        anon.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4' });
        await sleep(100);
        expect(anon.connected).toBe(false);
        expect(moves).toHaveLength(0);
    });

    test('an illegal move is rejected by the server itself, and the sender is resynced [S1]', async () => {
        const { white, black } = await seatedGame();
        const moves = record(black, 'move_made');
        const rejected = once(white, 'move_rejected');
        const resync = once(white, 'game_state_sync');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e5', san: 'e5??' });
        expect(await rejected).toEqual({ game_id: 'game-1', reason: 'illegal_move' });
        expect((await resync).fen).toBe(START_FEN);
        await sleep(50);
        expect(moves).toHaveLength(0);
        expect((await getGame('game-1')).fen).toBe(START_FEN);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('moves on a finished game are ignored', async () => {
        const { white, black } = await seatedGame();
        await setGame('game-1', { ...(await getGame('game-1')), status: 'completed' });
        const moves = record(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4' });
        await sleep(100);
        expect(moves).toHaveLength(0);
    });

    test('time spent is deducted from the mover and the increment is added', async () => {
        const { white, black } = await seatedGame({ lastMoveAt: Date.now() - 4000, whiteClockMs: 60000, incrementMs: 2000 });
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4' });
        const { whiteMs, blackMs } = await p;
        // 60 s - ~4 s thinking + 2 s increment ≈ 58 s
        expect(whiteMs).toBeGreaterThan(57500);
        expect(whiteMs).toBeLessThanOrEqual(58000);
        expect(blackMs).toBe(600000);
    });

    test('the first move does not consume clock time', async () => {
        const { white, black } = await seatedGame({ lastMoveAt: null, whiteClockMs: 60000 });
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4' });
        expect((await p).whiteMs).toBe(60000);
    });

    test('each move is persisted to the moves table', async () => {
        const { white, black } = await seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4' });
        await p;
        await sleep(20);
        const insert = supabase.op(supabase.callsFor('moves')[0], 'insert')[0];
        expect(insert).toMatchObject({ game_id: 'game-1', move_number: 1, color: 'white', uci: 'e2e4', san: 'e4', fen_after: AFTER_E4 });
    });

    test('with the engine unreachable, legal moves still work and illegal ones are still rejected [S10]', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        const { white, black } = await seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', from: 'e2', to: 'e4', fen: 'client-fen' });
        expect((await p).fen).toBe(AFTER_E4);
        const rejected = once(black, 'move_rejected');
        black.emit('make_move', { game_id: 'game-1', from: 'e7', to: 'e2', fen: 'client-fen' });
        expect((await rejected).reason).toBe('illegal_move');
        expect((await getGame('game-1')).fen).toBe(AFTER_E4);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('ending a game', () => {
    /** Answer the "finish if still active" update; any other games write gets an empty result. */
    function dbFinishAnswers(finished = { data: { id: 'game-1' }, error: null }) {
        const answer = (call) => (supabase.op(call, 'update')?.[0]?.status ? finished : { data: null, error: null });
        supabase.queue('games', answer, answer, answer);
    }
    const finishUpdate = () => supabase.callsFor('games').find(c => supabase.op(c, 'update')?.[0]?.status === 'completed');
    const emitAck = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));

    test('resign: the server names the winner, finalizes once, and rates the game [S3]', async () => {
        const { white, black } = await seatedGame();
        dbFinishAnswers();
        rating.processGameEnd.mockResolvedValueOnce({ white: { change: -8 }, black: { change: 8 } });

        const ended = once(black, 'game_end');
        const rated = once(black, 'rating_updated');
        // White resigns; anything else in the payload (a claimed result, player ids) is dropped.
        white.emit('resign', { game_id: 'game-1', result: 'White wins', white_id: 'evil', black_id: 'evil' });

        expect(await ended).toEqual({
            game_id: 'game-1', result: 'Black wins', reason: 'Resignation', white_id: 'white-user', black_id: 'black-user',
        });
        await rated;

        expect(await getGame('game-1')).toMatchObject({ status: 'completed', result: 'black', reason: 'Resignation' });
        expect(await getActiveGameIds()).not.toContain('game-1');

        const update = finishUpdate();
        expect(supabase.op(update, 'update')[0]).toMatchObject({ winner_id: 'black-user', result: 'black' });
        expect(update.ops).toContainEqual(['eq', 'status', 'active']);
        expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'black', '10', true);
    });

    test('a draw (stalemate) has no winner', async () => {
        const fen = '7k/4Q3/6K1/8/8/8/8/8 w - - 0 1';
        const { white, black } = await seatedGame({ fen, startFen: fen });
        dbFinishAnswers();
        const p = once(black, 'game_end');
        white.emit('make_move', { game_id: 'game-1', from: 'e7', to: 'f7' });
        expect(await p).toMatchObject({ result: 'Draw', reason: 'Stalemate' });
        await sleep(20);
        expect(supabase.op(finishUpdate(), 'update')[0]).toMatchObject({ result: 'draw', winner_id: null });
    });

    test('a client `game_end` is ignored: clients cannot report results [S3]', async () => {
        const { white, black } = await seatedGame();
        const ends = record(black, 'game_end');
        white.emit('game_end', { game_id: 'game-1', result: 'White wins', reason: 'Checkmate' });
        black.emit('game_end', { game_id: 'game-1', result: 'Black wins' });
        await sleep(150);
        expect(ends).toHaveLength(0);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
        expect(await getGame('game-1')).toMatchObject({ status: 'active', result: null });
        expect(finishUpdate()).toBeUndefined();
    });

    test('a second ending for the same game is ignored', async () => {
        const { white, black } = await seatedGame();
        dbFinishAnswers();
        const ends = record(black, 'game_end');
        const acks = await Promise.all([
            emitAck(white, 'resign', { game_id: 'game-1' }),
            emitAck(black, 'resign', { game_id: 'game-1' }),
        ]);
        await sleep(100);
        expect(acks.filter(a => a.ok)).toHaveLength(1);
        expect(ends).toHaveLength(1);
        expect(rating.processGameEnd).toHaveBeenCalledTimes(1);
    });

    test('the game is not rated twice if the database says it was already finalized', async () => {
        const { white, black } = await seatedGame();
        dbFinishAnswers({ data: null, error: null });
        const p = once(black, 'game_end');
        white.emit('resign', { game_id: 'game-1' });
        await p;
        await sleep(50);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
    });

    test('a finished game with moves is sent to the engine for review', async () => {
        const { white, black } = await seatedGame({ moveLog: [{ san: 'e4' }, { san: 'e5' }] });
        dbFinishAnswers();
        const p = once(black, 'game_end');
        white.emit('resign', { game_id: 'game-1' });
        await p;
        await sleep(30);
        const review = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/analyse-game'));
        expect(JSON.parse(review[1].body)).toMatchObject({ game_id: 'game-1', pgn: expect.stringContaining('1. e4 e5') });
    });

    test('only a participant can end a game, and only by resigning their own side [S3]', async () => {
        const { white } = await seatedGame();
        const stranger = await connect('stranger');
        const ends = record(white, 'game_end');
        expect(await emitAck(stranger, 'resign', { game_id: 'game-1' })).toEqual({ ok: false, error: 'not_a_player' });
        await sleep(50);
        expect(ends).toHaveLength(0);
        expect((await getGame('game-1')).status).toBe('active');
    });
});

describe('chat', () => {
    test('players can chat; the sender id is set by the server', async () => {
        const { white, black } = await seatedGame();
        const p = once(black, 'chat_message');
        white.emit('send_message', { game_id: 'game-1', message: 'gl hf', from_user_id: 'spoofed' });
        expect(await p).toMatchObject({ message: 'gl hf', from_user_id: 'white-user' });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('messages')[0], 'insert')[0]).toMatchObject({ user_id: 'white-user', content: 'gl hf' });
    });

    test('non-players cannot post in a game\'s chat', async () => {
        const { black } = await seatedGame();
        const stranger = await connect('stranger');
        stranger.emit('spectate_game', 'game-1');
        await sleep(30);
        const msgs = record(black, 'chat_message');
        stranger.emit('send_message', { game_id: 'game-1', message: 'spam' });
        await sleep(100);
        expect(msgs).toHaveLength(0);
    });
});

describe('disconnect and reconnect', () => {
    test('disconnecting mid-game starts the 20 s grace period and tells the opponent', async () => {
        const { white, black } = await seatedGame({ lastMoveAt: Date.now() });
        const p = once(black, 'opponent_disconnected');
        white.disconnect();
        expect(await p).toEqual({ userId: 'white-user', timeoutSeconds: 20 });
        expect((await getGame('game-1')).disconnectInfo).toMatchObject({ userId: 'white-user', side: 'white' });
    });

    test('reconnecting clears the grace period and resyncs the clock', async () => {
        const { white, black } = await seatedGame({ lastMoveAt: Date.now() });
        const gone = once(black, 'opponent_disconnected');
        white.disconnect();
        await gone;

        const back = once(black, 'opponent_reconnected');
        // Reconnecting is just connecting again: the handshake token identifies the player [S2].
        const again = open({ token: `${TOKEN_PREFIX}white-user` });
        const sync = once(again, 'clock_sync');

        expect(await back).toEqual({ userId: 'white-user' });
        await sync;
        expect((await getGame('game-1')).disconnectInfo).toBeNull();
    });

    test('disconnecting removes the player from the matchmaking queue', async () => {
        const s = await connect('queued');
        supabase.queue('profiles', { data: { id: 'queued', username: 'q', rating_rapid: 1500, games_played: 20 }, error: null });
        s.emit('join_queue', { user: { id: 'queued' }, time_control: '10' });
        await once(s, 'queue_joined');
        expect(matchmaking.queue.has('queued')).toBe(true);
        s.disconnect();
        await sleep(50);
        expect(matchmaking.queue.has('queued')).toBe(false);
    });
});

describe('matchmaking queue over sockets', () => {
    test('join_queue uses the rating from the database, not the client', async () => {
        const s = await connect('p1');
        supabase.queue('profiles', { data: { id: 'p1', username: 'p1', rating_blitz: 1650, rating_rapid: 1400, games_played: 30 }, error: null });
        s.emit('join_queue', { user: { id: 'p1', rating: 3000 }, time_control: '3+2' });
        await once(s, 'queue_joined');
        expect(matchmaking.queue.get('p1')).toMatchObject({ rating: 1650, isProvisional: false });
        s.emit('leave_queue', 'p1');
        await sleep(30);
        expect(matchmaking.queue.has('p1')).toBe(false);
    });

    test('join_queue for an unknown user is ignored', async () => {
        const s = await connect('ghost');
        s.emit('join_queue', { user: { id: 'ghost' }, time_control: '10' });
        await sleep(80);
        expect(matchmaking.queue.has('ghost')).toBe(false);
    });

    test('the queued player is the verified user, whatever id the payload claims [S2]', async () => {
        const s = await connect('p1');
        supabase.queue('profiles', { data: { id: 'p1', username: 'p1', rating_rapid: 1400, games_played: 30 }, error: null });
        s.emit('join_queue', { user: { id: 'victim' }, time_control: '10' });
        await once(s, 'queue_joined');
        expect(supabase.op(supabase.callsFor('profiles')[0], 'eq')).toEqual(['id', 'p1']);
        expect([...matchmaking.queue.keys()]).toEqual(['p1']);
    });

    test('leave_queue only removes the caller, not the id in the payload [G13]', async () => {
        const victim = await connect('victim');
        supabase.queue('profiles', { data: { id: 'victim', username: 'v', rating_rapid: 1400, games_played: 30 }, error: null });
        victim.emit('join_queue', { time_control: '10' });
        await once(victim, 'queue_joined');
        const attacker = await connect('attacker');
        attacker.emit('leave_queue', 'victim');
        await sleep(50);
        expect(matchmaking.queue.has('victim')).toBe(true);
    });
});

describe('challenges and rematches', () => {
    test('challenge_request reaches the target user and is stored as a notification', async () => {
        await connect('alice');
        const bob = await connect('bob');
        const p = once(bob, 'challenge_request');
        const alice = clients[clients.length - 2];
        alice.emit('challenge_request', { from_user_id: 'alice', to_user_id: 'bob', from_username: 'alice', time_control: '5', is_rated: true, color: 'white' });
        expect(await p).toMatchObject({ from_user_id: 'alice', time_control: '5' });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('notifications')[0], 'insert')[0]).toMatchObject({ user_id: 'bob', type: 'challenge' });
    });

    test('rematch_decline notifies the requester of a pending rematch [S4]', async () => {
        const alice = await connect('alice');
        const bob = await connect('bob');
        const asked = once(bob, 'rematch_request');
        alice.emit('rematch_request', { to_user_id: 'bob', time_control: '5', is_rated: true });
        await asked;
        const p = once(alice, 'rematch_declined');
        bob.emit('rematch_decline', { from_user_id: 'alice' });
        await p;
    });

    test('a rematch nobody asked for cannot be accepted [S4]', async () => {
        const alice = await connect('alice');
        const bob = await connect('bob');
        const ready = record(alice, 'rematch_ready');
        const ack = await new Promise((resolve) => bob.emit('rematch_accept', { from_user_id: 'alice', is_rated: true }, resolve));
        expect(ack).toEqual({ ok: false, error: 'no_pending_request' });
        await sleep(50);
        expect(ready).toHaveLength(0);
        expect(supabase.callsFor('games')).toHaveLength(0);
    });
});
