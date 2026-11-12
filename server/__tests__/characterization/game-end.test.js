/**
 * How games end, through the real server.
 *
 * Rewritten for S3 (NODE-16, NODE-18): the server decides every result. A game
 * ends when a move produces checkmate / stalemate / insufficient material /
 * threefold repetition / the fifty-move rule, or when a player sends `resign`.
 * The client `game_end` event is gone: the cases that pinned "the client's
 * result text is trusted" and "any socket can end any game" now assert that
 * such a payload does nothing.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn() }));

const { supabase } = require('../../supabase');
const rating = require('../../services/rating');
const { getGame, getActiveGameIds } = require('../../lib/gameStore');
const { useServer, once, record, sleep, waitFor, opsFor, ISO_DATE, START_FEN, ENGINE_HEADERS } = require('./harness');

const ctx = useServer();

/** Emit with an ack callback and resolve with what the server acknowledged. */
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

// 1. f3 e5 2. g4 — black mates with Qh4#.
const BEFORE_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';
const AFTER_MATE = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
const MOVES_BEFORE_MATE = [
    { move: 'f2f3', fen: 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1', san: 'f3' },
    { move: 'e7e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2', san: 'e5' },
    { move: 'g2g4', fen: BEFORE_MATE, san: 'g4' },
];
const MATE = { from: 'd8', to: 'h4' };
const PGN = '[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n1. f3 e5 2. g4 Qh4# *';

/** A seated game one move from fool's mate (black to play Qh4#). */
const oneMoveFromMate = (overrides = {}) =>
    ctx.seatedGame({ fen: BEFORE_MATE, activeSide: 'b', moveLog: MOVES_BEFORE_MATE, ...overrides });

/**
 * Answer the idempotent "finish if still active" games update with `finished`;
 * every other games write (the per-move FEN update) gets an empty result.
 */
function dbFinishAnswers(finished = { data: { id: 'x' }, error: null }) {
    const answer = (call) => (supabase.op(call, 'update')?.[0]?.status ? finished : { data: null, error: null });
    supabase.queue('games', answer, answer, answer, answer);
}

const finishUpdates = () => opsFor('games').filter((ops) => ops[0][0] === 'update' && ops[0][1].status === 'completed');
const reviewCalls = () => ctx.fetch.mock.calls.filter(([url]) => String(url).endsWith('/analyse-game'));

beforeEach(() => {
    rating.processGameEnd.mockReset();
    rating.processGameEnd.mockResolvedValue(null);
});

describe('checkmate', () => {
    test('the mating move ends the game: exact broadcast, Redis state, DB update, review trigger and rating call', async () => {
        rating.processGameEnd.mockResolvedValue({ white: { oldRating: 1500, newRating: 1492, change: -8 } });
        const { game, white, black } = await oneMoveFromMate({ whiteClockMs: 123456.6, blackClockMs: 98765.4 });
        dbFinishAnswers({ data: { id: game.id }, error: null });
        const events = [];
        white.onAny((event) => ['move_made', 'game_end', 'rating_updated'].includes(event) && events.push(event));
        const ended = once(white, 'game_end');
        const ratedWhite = once(white, 'rating_updated');
        const ratedBlack = once(black, 'rating_updated');

        expect(await emitAck(black, 'make_move', { game_id: game.id, ...MATE })).toEqual({ ok: true });

        expect(await ended).toEqual({
            game_id: game.id,
            result: 'Black wins',
            reason: 'Checkmate',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        expect(await ratedBlack).toEqual({ white: { oldRating: 1500, newRating: 1492, change: -8 } });
        await ratedWhite;
        expect(events).toEqual(['move_made', 'game_end', 'rating_updated']);

        const stored = await getGame(game.id);
        expect(stored).toEqual({
            ...game,
            fen: AFTER_MATE,
            activeSide: 'w',
            lastMoveAt: expect.any(Number),
            moveLog: [...MOVES_BEFORE_MATE, { move: 'd8h4', fen: AFTER_MATE, san: 'Qh4#' }],
            status: 'completed',
            result: 'black',
            // The reason is stored now (it used to stay null).
            reason: 'Checkmate',
        });
        expect(await getActiveGameIds()).toEqual([]);

        expect(finishUpdates()).toEqual([
            [
                [
                    'update',
                    {
                        status: 'completed',
                        // Was null for every decisive game (G1).
                        result: 'black',
                        winner_id: 'black-user',
                        ended_at: ISO_DATE,
                        final_fen: AFTER_MATE,
                        white_clock_ms: 123457,
                        black_clock_ms: 98765,
                    },
                ],
                ['eq', 'id', game.id],
                ['eq', 'status', 'active'],
                ['select', 'id'],
                ['maybeSingle'],
            ],
        ]);

        expect(reviewCalls()).toEqual([
            [
                'http://localhost:8001/analyse-game',
                {
                    method: 'POST',
                    headers: ENGINE_HEADERS,
                    body: JSON.stringify({ game_id: game.id, pgn: PGN, time_control: '10' }),
                },
            ],
        ]);
        expect(rating.processGameEnd.mock.calls).toEqual([[game.id, 'white-user', 'black-user', 'black', '10', true]]);
        // Review is fired before rating is processed.
        const reviewOrder =
            ctx.fetch.mock.invocationCallOrder[
                ctx.fetch.mock.calls.findIndex(([u]) => String(u).endsWith('/analyse-game'))
            ];
        expect(reviewOrder).toBeLessThan(rating.processGameEnd.mock.invocationCallOrder[0]);
    });

    test('no further moves are accepted once the game is over', async () => {
        const { game, white, black } = await oneMoveFromMate();
        dbFinishAnswers();
        const ended = once(white, 'game_end');
        black.emit('make_move', { game_id: game.id, ...MATE });
        await ended;
        const rejected = once(white, 'move_rejected');
        const told = once(white, 'game_end');
        expect(await emitAck(white, 'make_move', { game_id: game.id, from: 'e1', to: 'f2' })).toEqual({
            ok: false,
            error: 'game_not_active',
        });
        expect(await rejected).toEqual({ game_id: game.id, reason: 'game_not_active' });
        // The resync for a finished game is its result, with the real reason.
        expect(await told).toMatchObject({ result: 'Black wins', reason: 'Checkmate' });
    });

    test('GAMBIT_ENGINE_URL is used for the review trigger', async () => {
        process.env.GAMBIT_ENGINE_URL = 'http://engine.test:9000';
        const { game, black } = await oneMoveFromMate();
        dbFinishAnswers();
        black.emit('make_move', { game_id: game.id, ...MATE });
        await waitFor(() => reviewCalls().length === 1, 500, 'review');
        expect(reviewCalls()[0][0]).toBe('http://engine.test:9000/analyse-game');
    });
});

describe('draws decided by the server', () => {
    test('stalemate', async () => {
        const fen = '7k/4Q3/6K1/8/8/8/8/8 w - - 0 1';
        const { game, white, black } = await ctx.seatedGame({ fen, startFen: fen });
        dbFinishAnswers();
        const ended = once(black, 'game_end');
        white.emit('make_move', { game_id: game.id, from: 'e7', to: 'f7' });
        expect(await ended).toMatchObject({ result: 'Draw', reason: 'Stalemate' });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(rating.processGameEnd.mock.calls[0][3]).toBe('draw');
        expect(finishUpdates()[0][0][1]).toMatchObject({ result: 'draw', winner_id: null });
    });

    test('insufficient material: capturing the last piece leaves king vs king', async () => {
        const fen = '4k3/8/8/8/8/8/3p4/4K3 w - - 0 1';
        const { game, white, black } = await ctx.seatedGame({ fen, startFen: fen });
        dbFinishAnswers();
        const ended = once(black, 'game_end');
        white.emit('make_move', { game_id: game.id, from: 'e1', to: 'd2' });
        expect(await ended).toMatchObject({ result: 'Draw', reason: 'Insufficient material' });
    });

    test('threefold repetition, detected from the server’s own move history', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const ends = record(black, 'game_end');
        const shuffle = [
            [white, 'g1', 'f3'],
            [black, 'g8', 'f6'],
            [white, 'f3', 'g1'],
            [black, 'f6', 'g8'],
        ];
        for (const [socket, from, to] of [...shuffle, ...shuffle.slice(0, 3)]) {
            expect(await emitAck(socket, 'make_move', { game_id: game.id, from, to })).toEqual({ ok: true });
        }
        expect(ends).toEqual([]); // the start position has occurred only twice so far
        dbFinishAnswers();
        const ended = once(white, 'game_end');
        black.emit('make_move', { game_id: game.id, from: 'f6', to: 'g8' });
        expect(await ended).toMatchObject({ result: 'Draw', reason: 'Threefold repetition' });
        expect((await getGame(game.id)).fen).toBe(START_FEN.replace(' 0 1', ' 8 5'));
    });

    test('fifty-move rule', async () => {
        const fen = '4k3/8/8/8/8/8/4R3/4K3 w - - 99 80';
        const { game, white, black } = await ctx.seatedGame({ fen, startFen: fen });
        dbFinishAnswers();
        const ended = once(black, 'game_end');
        white.emit('make_move', { game_id: game.id, from: 'e2', to: 'd2' });
        expect(await ended).toMatchObject({ result: 'Draw', reason: 'Fifty-move rule' });
    });
});

describe('resign', () => {
    test.each([
        ['white', 'Black wins', 'black', 'black-user'],
        ['black', 'White wins', 'white', 'white-user'],
    ])('%s resigns → %s by Resignation', async (who, label, outcome, winnerId) => {
        const seated = await ctx.seatedGame({ moveLog: [{ move: 'e2e4', fen: 'x', san: 'e4' }] });
        dbFinishAnswers();
        const ended = once(seated.white, 'game_end');
        expect(await emitAck(seated[who], 'resign', { game_id: seated.game.id })).toEqual({ ok: true });
        expect(await ended).toEqual({
            game_id: seated.game.id,
            result: label,
            reason: 'Resignation',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(await getGame(seated.game.id)).toMatchObject({
            status: 'completed',
            result: outcome,
            reason: 'Resignation',
        });
        expect(finishUpdates()[0][0][1]).toMatchObject({ result: outcome, winner_id: winnerId });
        expect(rating.processGameEnd.mock.calls[0]).toEqual([
            seated.game.id,
            'white-user',
            'black-user',
            outcome,
            '10',
            true,
        ]);
    });

    test('a spectator or stranger cannot resign someone else’s game', async () => {
        const { game, white } = await ctx.seatedGame();
        const stranger = await ctx.connect('stranger');
        stranger.emit('join_game', game.id);
        await once(stranger, 'game_state_sync');
        const ends = record(white, 'game_end');
        expect(await emitAck(stranger, 'resign', { game_id: game.id })).toEqual({ ok: false, error: 'not_a_player' });
        await sleep(50);
        expect(ends).toEqual([]);
        expect((await getGame(game.id)).status).toBe('active');
        expect(opsFor('games')).toEqual([]);
    });

    test('resigning twice (or after the game ended) does nothing the second time', async () => {
        const { game, white, black } = await ctx.seatedGame();
        dbFinishAnswers();
        const ends = record(black, 'game_end');
        expect(await emitAck(white, 'resign', { game_id: game.id })).toEqual({ ok: true });
        expect(await emitAck(white, 'resign', { game_id: game.id })).toEqual({ ok: false, error: 'game_not_active' });
        expect(await emitAck(black, 'resign', { game_id: game.id })).toEqual({ ok: false, error: 'game_not_active' });
        await sleep(50);
        expect(ends).toHaveLength(1);
        expect(finishUpdates()).toHaveLength(1);
        expect(rating.processGameEnd).toHaveBeenCalledTimes(1);
    });

    test('unknown game / malformed payload', async () => {
        const white = await ctx.connect('white-user');
        expect(await emitAck(white, 'resign', { game_id: 'unknown' })).toEqual({ ok: false, error: 'game_not_found' });
        expect(await emitAck(white, 'resign', null)).toEqual({ ok: false, error: 'invalid_payload' });
        expect(opsFor('games')).toEqual([]);
    });

    test('a game with an empty seat cannot be resigned', async () => {
        const { game, white } = await ctx.seatedGame({ blackId: null });
        expect(await emitAck(white, 'resign', { game_id: game.id })).toEqual({ ok: false, error: 'game_not_active' });
        expect((await getGame(game.id)).status).toBe('active');
        expect(opsFor('games')).toEqual([]);
    });
});

describe('clients cannot report results [S3]', () => {
    test.each([
        ['a player claiming a win', 'white'],
        ['the opponent claiming a win', 'black'],
    ])('`game_end` from %s is ignored: no broadcast, no state change, no DB write, no rating', async (_name, who) => {
        const seated = await ctx.seatedGame();
        const ends = [record(seated.white, 'game_end'), record(seated.black, 'game_end')];
        seated[who].emit('game_end', {
            game_id: seated.game.id,
            result: `${who === 'white' ? 'White' : 'Black'} wins`,
            reason: 'Checkmate',
            white_id: 'evil',
            black_id: 'evil',
        });
        await sleep(100);
        expect(ends).toEqual([[], []]);
        expect(await getGame(seated.game.id)).toMatchObject({ status: 'active', result: null });
        expect(await getActiveGameIds()).toEqual([seated.game.id]);
        expect(opsFor('games')).toEqual([]);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
    });

    test('a signed-in stranger outside the room cannot end a game (was: any socket could)', async () => {
        const { game, white } = await ctx.seatedGame();
        const stranger = await ctx.connect();
        const seen = record(white, 'game_end');
        stranger.emit('game_end', { game_id: game.id, result: 'Black wins', reason: 'Resignation' });
        expect(await emitAck(stranger, 'resign', { game_id: game.id })).toEqual({ ok: false, error: 'not_a_player' });
        await sleep(80);
        expect(seen).toEqual([]);
        expect((await getGame(game.id)).status).toBe('active');
    });
});

describe('finalization details', () => {
    test('defaults: time_control "10", is_rated false; missing clocks → 0 (never a client value)', async () => {
        const { game, white } = await ctx.seatedGame({
            timeControl: undefined,
            isRated: undefined,
            whiteClockMs: undefined,
            blackClockMs: undefined,
            moveLog: [{ move: 'e2e4', fen: 'x', san: 'e4' }],
        });
        dbFinishAnswers();
        white.emit('resign', { game_id: game.id, time_control: '3+2', is_rated: true });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(rating.processGameEnd.mock.calls[0]).toEqual([
            game.id,
            'white-user',
            'black-user',
            'black',
            '10',
            false,
        ]);
        expect(finishUpdates()[0][0][1]).toMatchObject({ white_clock_ms: 0, black_clock_ms: 0 });
        expect(JSON.parse(reviewCalls()[0][1].body).time_control).toBe('10');
    });

    test('clocks are written from Redis as-is (time since lastMoveAt is not deducted)', async () => {
        const { game, white } = await ctx.seatedGame({ whiteClockMs: 50000, lastMoveAt: Date.now() - 20000 });
        dbFinishAnswers();
        const ended = once(white, 'game_end');
        white.emit('resign', { game_id: game.id });
        await ended;
        await waitFor(() => finishUpdates().length === 1, 500, 'db update');
        expect(finishUpdates()[0][0][1].white_clock_ms).toBe(50000);
    });

    test('no moves → no review request; rating still processed', async () => {
        const { game, white } = await ctx.seatedGame({ moveLog: [] });
        dbFinishAnswers();
        white.emit('resign', { game_id: game.id });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(reviewCalls()).toEqual([]);
    });

    test('rating returning null → no rating_updated', async () => {
        const { game, white, black } = await ctx.seatedGame();
        dbFinishAnswers();
        const ratingEvents = record(black, 'rating_updated');
        white.emit('resign', { game_id: game.id });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        await sleep(50);
        expect(ratingEvents).toEqual([]);
    });

    test('DB says already finalized → still broadcast, but no review and no rating', async () => {
        const { game, white, black } = await ctx.seatedGame({ moveLog: [{ move: 'e2e4', fen: 'x', san: 'e4' }] });
        dbFinishAnswers({ data: null, error: null });
        const ended = once(black, 'game_end');
        white.emit('resign', { game_id: game.id });
        await ended;
        await sleep(80);
        expect(reviewCalls()).toEqual([]);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
    });

    test('after the game ended, re-joining shows the stored result with its real reason', async () => {
        const { game, white } = await ctx.seatedGame();
        dbFinishAnswers();
        const ended = once(white, 'game_end');
        white.emit('resign', { game_id: game.id });
        await ended;
        const late = await ctx.connect();
        late.emit('join_game', game.id);
        expect(await once(late, 'game_end')).toEqual({
            game_id: game.id,
            result: 'Black wins',
            // Was always "Game over": the reason is stored with the result now.
            reason: 'Resignation',
            white_id: 'white-user',
            black_id: 'black-user',
        });
    });
});
