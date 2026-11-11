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

async function connect(userId) {
    const socket = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    clients.push(socket);
    await once(socket, 'connect');
    if (userId) {
        socket.emit('authenticate', userId);
        await once(socket, 'authenticated');
    }
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
        white.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4', fen: 'client-fen-ignored' });

        const move = await seenByBlack;
        expect(move).toMatchObject({ move: 'e2e4', san: 'e4', fen: AFTER_E4, whiteMs: 600000, blackMs: 600000 });

        const state = await getGame('game-1');
        expect(state).toMatchObject({ fen: AFTER_E4, activeSide: 'b' });
        expect(state.moveLog).toEqual([{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }]);
        expect(state.lastMoveAt).toEqual(expect.any(Number));
    });

    test('the server uses the engine\'s FEN, not the one the client sent', async () => {
        const { white, black } = await seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4', fen: '8/8/8/8/8/8/8/K6k w - - 0 1' });
        expect((await p).fen).toBe(AFTER_E4);
    });

    test('moving out of turn is ignored', async () => {
        const { white, black } = await seatedGame();
        const moves = record(white, 'move_made');
        black.emit('make_move', { game_id: 'game-1', move: 'e7e5', san: 'e5' });
        await sleep(100);
        expect(moves).toHaveLength(0);
        expect((await getGame('game-1')).activeSide).toBe('w');
    });

    test('a spectator or stranger cannot move for a player', async () => {
        const { white } = await seatedGame();
        const stranger = await connect('stranger');
        const moves = record(white, 'move_made');
        stranger.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4' });
        await sleep(100);
        expect(moves).toHaveLength(0);
    });

    test('an unauthenticated socket cannot move', async () => {
        const { white } = await seatedGame();
        const anon = await connect(null);
        const moves = record(white, 'move_made');
        anon.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4' });
        await sleep(100);
        expect(moves).toHaveLength(0);
    });

    test('an illegal move (per the engine) is rejected', async () => {
        fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ valid: false }) }));
        const { white, black } = await seatedGame();
        const moves = record(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', move: 'e2e5', san: 'e5??' });
        await sleep(100);
        expect(moves).toHaveLength(0);
        expect((await getGame('game-1')).fen).toBe(START_FEN);
    });

    test('moves on a finished game are ignored', async () => {
        const { white, black } = await seatedGame();
        await setGame('game-1', { ...(await getGame('game-1')), status: 'completed' });
        const moves = record(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4' });
        await sleep(100);
        expect(moves).toHaveLength(0);
    });

    test('time spent is deducted from the mover and the increment is added', async () => {
        const { white, black } = await seatedGame({ lastMoveAt: Date.now() - 4000, whiteClockMs: 60000, incrementMs: 2000 });
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4' });
        const { whiteMs, blackMs } = await p;
        // 60 s - ~4 s thinking + 2 s increment ≈ 58 s
        expect(whiteMs).toBeGreaterThan(57500);
        expect(whiteMs).toBeLessThanOrEqual(58000);
        expect(blackMs).toBe(600000);
    });

    test('the first move does not consume clock time', async () => {
        const { white, black } = await seatedGame({ lastMoveAt: null, whiteClockMs: 60000 });
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4' });
        expect((await p).whiteMs).toBe(60000);
    });

    test('each move is persisted to the moves table', async () => {
        const { white, black } = await seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'game-1', move: 'e2e4', san: 'e4' });
        await p;
        await sleep(20);
        const insert = supabase.op(supabase.callsFor('moves')[0], 'insert')[0];
        expect(insert).toMatchObject({ game_id: 'game-1', move_number: 1, color: 'white', uci: 'e2e4', san: 'e4', fen_after: AFTER_E4 });
    });

    test.todo('when the engine is unreachable, moves are accepted without validation (consider rejecting instead)');
});

describe('ending a game', () => {
    test('game_end uses server-side player ids, finalizes once, and rates the game', async () => {
        const { white, black } = await seatedGame();
        supabase.queue('games', { data: { id: 'game-1' }, error: null });
        rating.processGameEnd.mockResolvedValueOnce({ white: { change: 8 }, black: { change: -8 } });

        const ended = once(black, 'game_end');
        const rated = once(black, 'rating_updated');
        white.emit('game_end', { game_id: 'game-1', result: 'White wins', reason: 'Resignation', white_id: 'evil', black_id: 'evil' });

        expect(await ended).toMatchObject({ result: 'White wins', white_id: 'white-user', black_id: 'black-user' });
        await rated;

        expect(await getGame('game-1')).toMatchObject({ status: 'completed', result: 'white' });
        expect(await getActiveGameIds()).not.toContain('game-1');

        const update = supabase.callsFor('games').find(c => supabase.op(c, 'update')?.[0]?.status === 'completed');
        expect(supabase.op(update, 'update')[0]).toMatchObject({ winner_id: 'white-user', result: null });
        expect(update.ops).toContainEqual(['eq', 'status', 'active']);
        expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'white', '10', true);
    });

    test('a draw has no winner', async () => {
        const { white, black } = await seatedGame();
        supabase.queue('games', { data: { id: 'game-1' }, error: null });
        const p = once(black, 'game_end');
        white.emit('game_end', { game_id: 'game-1', result: 'Draw', reason: 'Agreement' });
        await p;
        await sleep(20);
        const update = supabase.callsFor('games').find(c => supabase.op(c, 'update')?.[0]?.status === 'completed');
        expect(supabase.op(update, 'update')[0]).toMatchObject({ result: 'draw', winner_id: null });
    });

    test('a second game_end for the same game is ignored', async () => {
        const { white, black } = await seatedGame();
        supabase.queue('games', { data: { id: 'game-1' }, error: null });
        const ends = record(black, 'game_end');
        white.emit('game_end', { game_id: 'game-1', result: 'White wins' });
        black.emit('game_end', { game_id: 'game-1', result: 'Black wins' });
        await sleep(150);
        expect(ends).toHaveLength(1);
        expect(rating.processGameEnd).toHaveBeenCalledTimes(1);
        expect((await getGame('game-1')).result).toBe('white');
    });

    test('the game is not rated twice if the database says it was already finalized', async () => {
        const { white, black } = await seatedGame();
        supabase.queue('games', { data: null, error: null });
        const p = once(black, 'game_end');
        white.emit('game_end', { game_id: 'game-1', result: 'White wins' });
        await p;
        await sleep(50);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
    });

    test('a finished game with moves is sent to the engine for review', async () => {
        const { white, black } = await seatedGame({ moveLog: [{ san: 'e4' }, { san: 'e5' }] });
        supabase.queue('games', { data: { id: 'game-1' }, error: null });
        const p = once(black, 'game_end');
        white.emit('game_end', { game_id: 'game-1', result: 'Draw' });
        await p;
        await sleep(30);
        const review = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/analyse-game'));
        expect(JSON.parse(review[1].body)).toMatchObject({ game_id: 'game-1', pgn: expect.stringContaining('1. e4 e5') });
    });

    test.todo('game_end is accepted from any socket, including non-players and the losing claim of the winner (verify sender + result server-side)');
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
        const again = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
        clients.push(again);
        await once(again, 'connect');
        const sync = once(again, 'clock_sync');
        again.emit('authenticate', 'white-user');

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

    test.todo('authenticate trusts any userId the client sends — verify a Supabase access token instead');
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

    test('rematch_decline notifies the requester', async () => {
        const alice = await connect('alice');
        const bob = await connect('bob');
        const p = once(alice, 'rematch_declined');
        bob.emit('rematch_decline', { to_user_id: 'alice' });
        await p;
    });
});
