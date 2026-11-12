/**
 * join_game (Redis / DB restore / completed games), spectate_game and
 * make_move through the real server.
 *
 * make_move was rewritten for S1 + S10: the server validates every move with
 * its own chess rules, computes uci/san/fen itself, never calls the engine and
 * never reads a client FEN. The cases that pinned the old engine-validation
 * and client-FEN bugs now assert the corrected behaviour.
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

const GAME_COLUMNS =
    'id, status, white_id, black_id, is_rated, time_control, fen, white_clock_ms, black_clock_ms, result, winner_id';
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
    // The restore reads white_clock_ms/black_clock_ms, the same pair every write uses (G2).
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
            startFen: AFTER_E4,
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
        // [result column, winner_id, label]
        ['white', 'w', 'White wins'],
        ['black', 'b', 'Black wins'],
        ['draw', null, 'Draw'],
        // Rows written before S3 stored result null for a decisive game; the winner column
        // now decides, so they no longer come back as "Draw" (G1).
        [null, 'w', 'White wins'],
        [null, 'b', 'Black wins'],
        [null, null, 'Draw'],
    ])('completed game in DB with result %p, winner %p → game_end %p', async (result, winnerId, text) => {
        supabase.queue('games', {
            data: { id: 'db-c', status: 'completed', result, winner_id: winnerId, white_id: 'w', black_id: 'b' },
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
        white.emit('make_move', { game_id: game.id, from: 'e2', to: 'e4' });
        expect(await seen).toMatchObject({ move: 'e2e4' });
        expect(notSeen).toEqual([]);
        expect(opsFor('games').filter((ops) => ops[0][0] === 'select')).toEqual([]);
    });
});

/** Emit with an ack callback and resolve with what the server acknowledged. */
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const E4 = { from: 'e2', to: 'e4' };

describe('make_move', () => {
    test('valid move: exact server-computed move_made payload, Redis state and DB writes; no engine call', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const seenByBlack = once(black, 'move_made');
        const seenByWhite = once(white, 'move_made');
        // What the frontend used to send, plus lies: all but from/to/promotion is dropped.
        white.emit('make_move', {
            game_id: game.id,
            ...E4,
            promotion: 'q',
            fen: CLIENT_FEN,
            san: 'Qxf7#',
            move: 'd1f7',
            captured: true,
            extra: 'dropped by the schema',
        });

        const expected = {
            game_id: game.id,
            from: 'e2',
            to: 'e4',
            move: 'e2e4',
            san: 'e4',
            fen: AFTER_E4,
            captured: false,
            flags: 'b',
            whiteMs: 600000,
            blackMs: 600000,
        };
        expect(await seenByBlack).toEqual(expected);
        expect(await seenByWhite).toEqual(expected);

        expect(ctx.fetch).not.toHaveBeenCalled();
        expect(await getGame(game.id)).toEqual({
            ...game,
            fen: AFTER_E4,
            activeSide: 'b',
            lastMoveAt: expect.any(Number),
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
        });
        await sleep(20);
        expect(opsFor('games')).toEqual([
            [['update', { fen: AFTER_E4, white_clock_ms: 600000, black_clock_ms: 600000 }], ['eq', 'id', game.id]],
        ]);
        expect(opsFor('moves')).toEqual([
            [
                [
                    'insert',
                    {
                        game_id: game.id,
                        move_number: 1,
                        color: 'white',
                        // Was `undefined` (NOT NULL column) because the client never sent `move` [S1].
                        uci: 'e2e4',
                        san: 'e4',
                        fen_after: AFTER_E4,
                        clock_ms_remaining: 600000,
                    },
                ],
            ],
        ]);
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
        black.emit('make_move', { game_id: game.id, from: 'e7', to: 'e5' });
        expect(await p).toEqual({
            game_id: game.id,
            from: 'e7',
            to: 'e5',
            move: 'e7e5',
            san: 'e5',
            fen: AFTER_E4_E5,
            captured: false,
            flags: 'b',
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
            fen_after: AFTER_E4_E5,
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
        white.emit('make_move', { game_id: game.id, ...E4 });
        expect(await p).toMatchObject({ whiteMs: 58000.6, blackMs: 600000 });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('moves')[0], 'insert')[0].clock_ms_remaining).toBe(58001);
    });

    test('a flagged player who moves before the ticker fires gets 0 + increment (pinned, G7)', async () => {
        const T = Date.now();
        const { game, white, black } = await ctx.seatedGame({ whiteClockMs: 60000, incrementMs: 2000 });
        await setGame(game.id, { ...(await getGame(game.id)), lastMoveAt: T - 70000 });
        jest.spyOn(Date, 'now').mockReturnValue(T);
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, ...E4 });
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
        white.emit('make_move', { game_id: 'inc-1', ...E4 });
        expect(await p).toMatchObject({ whiteMs: 605000, blackMs: 600000 });
    });

    test('illegal move → move_rejected + a fresh game_state_sync to the sender only; nothing persisted or changed [S1]', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const before = await getGame(game.id);
        const moves = [record(white, 'move_made'), record(black, 'move_made')];
        const blackGot = recordAll(black);
        const rejected = once(white, 'move_rejected');
        const resync = once(white, 'game_state_sync');
        // A "pawn to e5 in one move", with a FEN that claims it happened.
        const ack = await emitAck(white, 'make_move', {
            game_id: game.id,
            from: 'e2',
            to: 'e5',
            fen: 'rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
            san: 'e5',
        });
        expect(ack).toEqual({ ok: false, error: 'illegal_move' });
        expect(await rejected).toEqual({ game_id: game.id, reason: 'illegal_move' });
        expect(await resync).toMatchObject({ fen: START_FEN, moveLog: [], activeSide: 'w' });
        await sleep(50);
        expect(moves).toEqual([[], []]);
        expect(blackGot.filter(([e]) => e !== 'queue_status')).toEqual([]);
        expect(await getGame(game.id)).toEqual(before);
        expect(opsFor('games').filter((ops) => ops[0][0] === 'update')).toEqual([]);
        expect(opsFor('moves')).toEqual([]);
    });

    test('engine unreachable → moves are still validated by the server; the client FEN is never used [S10]', async () => {
        ctx.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
        const { game, white, black } = await ctx.seatedGame();
        const p = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, ...E4, fen: CLIENT_FEN, san: 'e4' });
        expect((await p).fen).toBe(AFTER_E4);
        expect((await getGame(game.id)).fen).toBe(AFTER_E4);
        // ...and an illegal move is still refused with the engine down.
        expect(await emitAck(black, 'make_move', { game_id: game.id, from: 'e7', to: 'e4', fen: 'anything' })).toEqual({
            ok: false,
            error: 'illegal_move',
        });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('moves')[0], 'insert')[0].fen_after).toBe(AFTER_E4);
        expect(ctx.fetch).not.toHaveBeenCalled();
    });

    test('the stored FEN survives any payload: a move without a client fen keeps Redis intact [S10]', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const first = once(black, 'move_made');
        white.emit('make_move', { game_id: game.id, ...E4 });
        expect(await first).toHaveProperty('fen', AFTER_E4);
        expect(await getGame(game.id)).toHaveProperty('fen', AFTER_E4);

        // The follow-up nonsense move that used to sail through is rejected.
        const moves = record(white, 'move_made');
        expect(await emitAck(black, 'make_move', { game_id: game.id, from: 'a1', to: 'h8', fen: 'anything' })).toEqual({
            ok: false,
            error: 'illegal_move',
        });
        expect(moves).toEqual([]);
        expect((await getGame(game.id)).fen).toBe(AFTER_E4);
    });

    test('a payload without from/to is invalid: the old "no `move` → skip validation" hole is closed [S1]', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const moves = record(black, 'move_made');
        expect(await emitAck(white, 'make_move', { game_id: game.id, san: 'e4', fen: CLIENT_FEN })).toEqual({
            ok: false,
            error: 'invalid_payload',
        });
        expect(await emitAck(white, 'make_move', { game_id: game.id, move: 'e2e4' })).toEqual({
            ok: false,
            error: 'invalid_payload',
        });
        await sleep(50);
        expect(moves).toEqual([]);
        expect((await getGame(game.id)).fen).toBe(START_FEN);
    });

    test('out-of-turn / unknown game: rejected with a reason, no DB writes', async () => {
        const { game, black } = await ctx.seatedGame();
        expect(await emitAck(black, 'make_move', { game_id: game.id, from: 'e7', to: 'e5' })).toEqual({
            ok: false,
            error: 'not_your_turn',
        });
        expect(await emitAck(black, 'make_move', { game_id: 'no-such-game', from: 'e7', to: 'e5' })).toEqual({
            ok: false,
            error: 'game_not_found',
        });
        await sleep(50);
        expect(ctx.fetch).not.toHaveBeenCalled();
        expect(opsFor('moves')).toEqual([]);
    });

    test('a spectator in the room cannot move either side', async () => {
        const { game, white } = await ctx.seatedGame();
        const spectator = await ctx.connect('stranger');
        spectator.emit('join_game', game.id);
        await once(spectator, 'game_state_sync');
        const moves = record(white, 'move_made');
        expect(await emitAck(spectator, 'make_move', { game_id: game.id, ...E4 })).toEqual({
            ok: false,
            error: 'not_a_player',
        });
        await sleep(50);
        expect(moves).toEqual([]);
    });

    test('the same move sent twice in one tick is applied once (atomic transition)', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const moves = record(black, 'move_made');
        const acks = await Promise.all([
            emitAck(white, 'make_move', { game_id: game.id, ...E4 }),
            emitAck(white, 'make_move', { game_id: game.id, ...E4 }),
        ]);
        await sleep(50);
        expect(acks).toEqual([{ ok: true }, { ok: false, error: 'not_your_turn' }]);
        expect(moves).toHaveLength(1);
        expect((await getGame(game.id)).moveLog).toHaveLength(1);
    });

    test('a full legal sequence: castling and a capture are computed by the server', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const seen = record(black, 'move_made');
        const line = [
            [white, 'e2', 'e4'],
            [black, 'e7', 'e5'],
            [white, 'g1', 'f3'],
            [black, 'b8', 'c6'],
            [white, 'f1', 'c4'],
            [black, 'd7', 'd5'],
            [white, 'e4', 'd5'],
            [black, 'g8', 'f6'],
            [white, 'e1', 'g1'],
        ];
        for (const [socket, from, to] of line) {
            expect(await emitAck(socket, 'make_move', { game_id: game.id, from, to })).toEqual({ ok: true });
        }
        await sleep(30);
        expect(seen.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd5', 'exd5', 'Nf6', 'O-O']);
        expect(seen[6]).toMatchObject({ captured: true, move: 'e4d5' });
        expect(seen[8].flags).toContain('k');
        expect((await getGame(game.id)).moveLog.map((m) => m.move)).toEqual([
            'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'd7d5', 'e4d5', 'g8f6', 'e1g1',
        ]);
    });
});
