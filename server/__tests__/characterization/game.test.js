/**
 * Characterization: join_game (Redis / DB restore / completed games),
 * spectate_game and make_move (engine validation, clocks, persistence).
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const redis = require('../../lib/redis');
const { getGame, setGame } = require('../../lib/gameStore');
const { useServer, once, record, recordAll, sleep, opsFor, makeGame, uniqueId, AFTER_E4, START_FEN } = require('./harness');

const ctx = useServer();

const GAME_COLUMNS = 'id, status, white_id, black_id, is_rated, time_control, fen, white_clock_ms, black_clock_ms';
const CLIENT_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('join_game: game in Redis', () => {
    test('active game with a running clock but a disconnected player → clocks NOT deducted', async () => {
        const game = makeGame({
            id: uniqueId('g'),
            fen: AFTER_E4,
            activeSide: 'b',
            whiteClockMs: 111000,
            blackClockMs: 222000,
            lastMoveAt: Date.now() - 30000,
            disconnectInfo: { userId: 'white-user', side: 'white', at: Date.now() },
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
        });
        await setGame(game.id, game);
        const s = await ctx.connect('black-user');
        s.emit('join_game', game.id);
        expect(await once(s, 'game_state_sync')).toEqual({
            fen: AFTER_E4,
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
            whiteMs: 111000,
            blackMs: 222000,
            activeSide: 'b',
            clockActive: true,
            whiteId: 'white-user',
            blackId: 'black-user',
        });
        expect(supabase.calls).toEqual([]);
    });

    test('a running clock is deducted for the side to move and floored at 0', async () => {
        const game = makeGame({ id: uniqueId('g'), whiteClockMs: 5000, lastMoveAt: Date.now() - 60000 });
        await setGame(game.id, game);
        const s = await ctx.connect();
        s.emit('join_game', game.id);
        expect(await once(s, 'game_state_sync')).toMatchObject({ whiteMs: 0, blackMs: 600000, clockActive: true });
    });

    test('a missing moveLog is sent as []', async () => {
        const game = makeGame({ id: uniqueId('g') });
        delete game.moveLog;
        await setGame(game.id, game);
        const s = await ctx.connect();
        s.emit('join_game', game.id);
        expect((await once(s, 'game_state_sync')).moveLog).toEqual([]);
    });

    test.each([
        ['white', 'Resignation', 'White wins', 'Resignation'],
        ['black', null, 'Black wins', 'Game over'],
        ['draw', 'Agreement', 'Draw', 'Agreement'],
        [null, undefined, 'Draw', 'Game over'],
    ])('completed game (result %p, reason %p) → game_end %p / %p', async (result, reason, text, shownReason) => {
        const game = makeGame({ id: uniqueId('g'), status: 'completed', result, reason });
        await setGame(game.id, game);
        const s = await ctx.connect();
        const events = recordAll(s);
        s.emit('join_game', game.id);
        await once(s, 'game_end');
        expect(events).toEqual([
            [
                'game_end',
                { game_id: game.id, result: text, reason: shownReason, white_id: 'white-user', black_id: 'black-user' },
            ],
        ]);
    });
});

describe('join_game: restore from the database (Redis empty)', () => {
    // NOTE: the column list reads white_clock_ms/black_clock_ms, while the disconnect
    // handler writes white_time_ms/black_time_ms (BUG pinned in timers.test.js).
    test('queries games by id with a fixed column list; unknown game → nothing emitted', async () => {
        const s = await ctx.connect();
        const events = recordAll(s);
        s.emit('join_game', 'nope');
        await sleep(80);
        expect(opsFor('games')).toEqual([[['select', GAME_COLUMNS], ['eq', 'id', 'nope'], ['maybeSingle']]]);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([]);
        expect(redis._strings.size).toBe(0);
    });

    test('active game with stored clocks → exact Redis object, clock running', async () => {
        supabase.queue('games', {
            data: {
                id: 'db-1',
                status: 'active',
                white_id: 'w',
                black_id: 'b',
                is_rated: true,
                time_control: '5+3',
                fen: AFTER_E4,
                white_clock_ms: 250000,
                black_clock_ms: 280000,
            },
            error: null,
        });
        const s = await ctx.connect('w');
        s.emit('join_game', 'db-1');
        const sync = await once(s, 'game_state_sync');

        expect(await getGame('db-1')).toEqual({
            id: 'db-1',
            fen: AFTER_E4,
            whiteId: 'w',
            blackId: 'b',
            whiteClockMs: 250000,
            blackClockMs: 280000,
            activeSide: 'b',
            status: 'active',
            result: null,
            reason: null,
            moveLog: [],
            timeControl: '5+3',
            incrementMs: 3000,
            isRated: true,
            lastMoveAt: expect.any(Number),
            disconnectInfo: null,
        });
        expect([...redis._sets.get('active_games')]).toEqual(['db-1']);
        expect(sync).toEqual({
            fen: AFTER_E4,
            moveLog: [],
            whiteMs: 250000,
            blackMs: expect.any(Number),
            activeSide: 'b',
            clockActive: true,
            whiteId: 'w',
            blackId: 'b',
        });
        expect(sync.blackMs).toBeGreaterThan(279900);
        expect(sync.blackMs).toBeLessThanOrEqual(280000);
    });

    test('active game with no clocks/fen/is_rated → defaults from time_control, clock not started', async () => {
        supabase.queue('games', {
            data: {
                id: 'db-2',
                status: 'active',
                white_id: 'w',
                black_id: 'b',
                is_rated: null,
                time_control: '3+2',
                fen: null,
                white_clock_ms: null,
                black_clock_ms: null,
            },
            error: null,
        });
        const s = await ctx.connect();
        s.emit('join_game', 'db-2');
        expect(await once(s, 'game_state_sync')).toEqual({
            fen: START_FEN,
            moveLog: [],
            whiteMs: 180000,
            blackMs: 180000,
            activeSide: 'w',
            clockActive: false,
            whiteId: 'w',
            blackId: 'b',
        });
        expect(await getGame('db-2')).toMatchObject({
            whiteClockMs: 180000,
            blackClockMs: 180000,
            incrementMs: 2000,
            isRated: false,
            lastMoveAt: null,
        });
    });

    test.each([
        ['white', 'White wins'],
        ['black', 'Black wins'],
        ['draw', 'Draw'],
        // game_end writes result:null for decisive games, so they come back as "Draw" (BUG pinned).
        [null, 'Draw'],
    ])('completed game in DB with result %p → game_end %p', async (result, text) => {
        supabase.queue('games', {
            data: { id: 'db-c', status: 'completed', result, winner_id: 'w', white_id: 'w', black_id: 'b' },
            error: null,
        });
        const s = await ctx.connect();
        s.emit('join_game', 'db-c');
        expect(await once(s, 'game_end')).toEqual({
            game_id: 'db-c',
            result: text,
            reason: 'Game over',
            white_id: 'w',
            black_id: 'b',
        });
        expect(redis._strings.size).toBe(0);
    });

    test('a waiting game in DB → nothing emitted, nothing cached', async () => {
        supabase.queue('games', { data: { id: 'db-w', status: 'waiting', white_id: 'w', black_id: null }, error: null });
        const s = await ctx.connect();
        const events = record(s, 'game_state_sync');
        const ends = record(s, 'game_end');
        s.emit('join_game', 'db-w');
        await sleep(80);
        expect(events).toEqual([]);
        expect(ends).toEqual([]);
        expect(redis._strings.size).toBe(0);
    });
});

describe('spectate_game', () => {
    test('joins the room only when the game exists in Redis (no DB fallback)', async () => {
        const { game, white } = await ctx.seatedGame();
        const spectator = await ctx.connect();
        const lost = await ctx.connect();
        spectator.emit('spectate_game', game.id);
        lost.emit('spectate_game', 'missing-game');
        await sleep(50);
        const seen = once(spectator, 'move_made');
        const notSeen = record(lost, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4' });
        expect(await seen).toMatchObject({ move: 'e2e4' });
        expect(notSeen).toEqual([]);
        expect(opsFor('games').filter((ops) => ops[0][0] === 'select')).toEqual([]);
    });
});

describe('make_move', () => {
    test('valid move: engine call, exact move_made payload, Redis state, and DB writes', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const seenByBlack = once(black, 'move_made');
        const seenByWhite = once(white, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4', fen: CLIENT_FEN, extra: 'kept' });

        const expected = {
            game_id: game.id,
            move: 'e2e4',
            san: 'e4',
            fen: AFTER_E4,
            extra: 'kept',
            whiteMs: 600000,
            blackMs: 600000,
        };
        expect(await seenByBlack).toEqual(expected);
        expect(await seenByWhite).toEqual(expected);

        expect(ctx.fetch.mock.calls).toEqual([
            [
                'http://localhost:8001/validate-move',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fen: START_FEN, move: 'e2e4' }),
                },
            ],
        ]);
        expect(await getGame(game.id)).toEqual({
            ...game,
            fen: AFTER_E4,
            activeSide: 'b',
            lastMoveAt: expect.any(Number),
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
        });
        await sleep(20);
        expect(opsFor('games')).toEqual([[['update', { fen: AFTER_E4 }], ['eq', 'id', game.id]]]);
        expect(opsFor('moves')).toEqual([
            [
                [
                    'insert',
                    {
                        game_id: game.id,
                        move_number: 1,
                        color: 'white',
                        uci: 'e2e4',
                        san: 'e4',
                        fen_after: AFTER_E4,
                        clock_ms_remaining: 600000,
                    },
                ],
            ],
        ]);
    });

    test('ENGINE_URL overrides the validation endpoint', async () => {
        process.env.ENGINE_URL = 'http://engine.test:9000';
        const { game, white, black } = await ctx.seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4' });
        await p;
        expect(ctx.fetch.mock.calls[0][0]).toBe('http://engine.test:9000/validate-move');
    });

    test('black move: color black, move_number counts the move log, black clock decremented', async () => {
        const T = Date.now();
        const { game, white, black } = await ctx.seatedGame({
            fen: AFTER_E4,
            activeSide: 'b',
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
            blackClockMs: 300000,
            incrementMs: 1000,
        });
        await setGame(game.id, { ...(await getGame(game.id)), lastMoveAt: T - 7000 });
        jest.spyOn(Date, 'now').mockReturnValue(T);
        const p = once(white, 'move_made');
        black.emit('make_move', { game_id: game.id, move: 'e7e5', san: 'e5' });
        expect(await p).toEqual({
            game_id: game.id,
            move: 'e7e5',
            san: 'e5',
            fen: AFTER_E4,
            whiteMs: 600000,
            blackMs: 294000,
        });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('moves')[0], 'insert')[0]).toEqual({
            game_id: game.id,
            move_number: 2,
            color: 'black',
            uci: 'e7e5',
            san: 'e5',
            fen_after: AFTER_E4,
            clock_ms_remaining: 294000,
        });
        expect((await getGame(game.id)).lastMoveAt).toBe(T);
    });

    test('clock math: elapsed deducted, increment added; fractional ms rounded only in the DB', async () => {
        const T = Date.now();
        const { game, white, black } = await ctx.seatedGame({ whiteClockMs: 60000.6, incrementMs: 2000 });
        await setGame(game.id, { ...(await getGame(game.id)), lastMoveAt: T - 4000 });
        jest.spyOn(Date, 'now').mockReturnValue(T);
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4' });
        expect(await p).toMatchObject({ whiteMs: 58000.6, blackMs: 600000 });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('moves')[0], 'insert')[0].clock_ms_remaining).toBe(58001);
    });

    test('a flagged player who moves before the ticker fires gets 0 + increment (pinned)', async () => {
        const T = Date.now();
        const { game, white, black } = await ctx.seatedGame({ whiteClockMs: 60000, incrementMs: 2000 });
        await setGame(game.id, { ...(await getGame(game.id)), lastMoveAt: T - 70000 });
        jest.spyOn(Date, 'now').mockReturnValue(T);
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4' });
        expect((await p).whiteMs).toBe(2000);
    });

    test('"10+5" game restored from DB: first move adds the 5 s increment without deducting time', async () => {
        supabase.queue('games', {
            data: {
                id: 'inc-1',
                status: 'active',
                white_id: 'white-user',
                black_id: 'black-user',
                is_rated: true,
                time_control: '10+5',
                fen: START_FEN,
                white_clock_ms: null,
                black_clock_ms: null,
            },
            error: null,
        });
        const white = await ctx.connect('white-user');
        const black = await ctx.connect('black-user');
        white.emit('join_game', 'inc-1');
        await once(white, 'game_state_sync');
        black.emit('join_game', 'inc-1');
        await once(black, 'game_state_sync');
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: 'inc-1', move: 'e2e4', san: 'e4' });
        expect(await p).toMatchObject({ whiteMs: 605000, blackMs: 600000 });
    });

    test('engine says invalid → nothing emitted, persisted or changed', async () => {
        ctx.fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ valid: false }) }));
        const { game, white, black } = await ctx.seatedGame();
        const before = await getGame(game.id);
        const moves = [...record(white, 'move_made'), ...record(black, 'move_made')];
        white.emit('make_move', { game_id: game.id, move: 'e2e5', san: 'e5' });
        await sleep(100);
        expect(moves).toEqual([]);
        expect(await getGame(game.id)).toEqual(before);
        expect(opsFor('games').filter((ops) => ops[0][0] === 'update')).toEqual([]);
        expect(opsFor('moves')).toEqual([]);
    });

    test('engine unreachable → move accepted with the CLIENT fen (BUG pinned)', async () => {
        ctx.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
        const { game, white, black } = await ctx.seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4', fen: CLIENT_FEN });
        expect(await p).toEqual({
            game_id: game.id,
            move: 'e2e4',
            san: 'e4',
            fen: CLIENT_FEN,
            whiteMs: 600000,
            blackMs: 600000,
        });
        expect((await getGame(game.id)).fen).toBe(CLIENT_FEN);
        await sleep(20);
        expect(supabase.op(supabase.callsFor('moves')[0], 'insert')[0].fen_after).toBe(CLIENT_FEN);
    });

    test('engine non-ok response → client fen used and the body is never read', async () => {
        const json = jest.fn(async () => ({ valid: false }));
        ctx.fetch.mockImplementation(async () => ({ ok: false, status: 503, json }));
        const { game, white, black } = await ctx.seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4', fen: CLIENT_FEN });
        expect((await p).fen).toBe(CLIENT_FEN);
        expect(json).not.toHaveBeenCalled();
    });

    test('engine down + no client fen → Redis loses its fen and later moves skip validation (BUG pinned)', async () => {
        ctx.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const { game, white, black } = await ctx.seatedGame();
        const first = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, move: 'e2e4', san: 'e4' });
        expect(await first).not.toHaveProperty('fen');
        expect(await getGame(game.id)).not.toHaveProperty('fen');

        const second = once(white, 'move_made');
        black.emit('make_move', { game_id: game.id, move: 'zzzz', san: '??', fen: 'anything' });
        expect(await second).toMatchObject({ move: 'zzzz', fen: 'anything' });
        expect(ctx.fetch).toHaveBeenCalledTimes(1);
    });

    test('a move without `move` skips engine validation entirely (pinned)', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, san: 'e4', fen: CLIENT_FEN });
        expect(await p).toEqual({ game_id: game.id, san: 'e4', fen: CLIENT_FEN, whiteMs: 600000, blackMs: 600000 });
        expect(ctx.fetch).not.toHaveBeenCalled();
    });

    test('out-of-turn / unknown game: no engine call, no DB writes', async () => {
        const { game, black } = await ctx.seatedGame();
        black.emit('make_move', { game_id: game.id, move: 'e7e5', san: 'e5' });
        black.emit('make_move', { game_id: 'no-such-game', move: 'e7e5', san: 'e5' });
        await sleep(100);
        expect(ctx.fetch).not.toHaveBeenCalled();
        expect(opsFor('moves')).toEqual([]);
    });
});
