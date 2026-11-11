/**
 * Characterization: client-initiated `game_end` — Redis state, broadcast payload,
 * idempotent games update, review trigger and rating call. The result is taken
 * from the client and the sender is not participant-checked (known bugs, pinned).
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn() }));

const { supabase } = require('../../supabase');
const rating = require('../../services/rating');
const { getGame, getActiveGameIds } = require('../../lib/gameStore');
const { useServer, once, record, sleep, waitFor, opsFor, ISO_DATE, AFTER_E4 } = require('./harness');

const ctx = useServer();

const MOVE_LOG = [
    { move: 'e2e4', fen: 'x', san: 'e4' },
    { move: 'e7e5', fen: AFTER_E4, san: 'e5' },
    { move: 'g1f3', fen: 'y', san: 'Nf3' },
];
const PGN = '[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n1. e4 e5 2. Nf3 *';

beforeEach(() => {
    rating.processGameEnd.mockReset();
    rating.processGameEnd.mockResolvedValue(null);
});

/** Seat a game that has moves, queue the "still active" DB answer, and end it. */
async function endGame(data, overrides = {}, dbUpdated = { data: { id: 'x' }, error: null }) {
    const seated = await ctx.seatedGame({ moveLog: MOVE_LOG, fen: AFTER_E4, ...overrides });
    supabase.queue('games', dbUpdated);
    const ended = once(seated.black, 'game_end');
    const ratingEvents = record(seated.black, 'rating_updated');
    seated.white.emit('game_end', { game_id: seated.game.id, ...data });
    const payload = await ended;
    return { ...seated, payload, ratingEvents };
}

const reviewCalls = () => ctx.fetch.mock.calls.filter(([url]) => String(url).endsWith('/analyse-game'));

describe('game_end', () => {
    test('exact broadcast, Redis state, DB update, review trigger and rating call', async () => {
        rating.processGameEnd.mockResolvedValue({ white: { oldRating: 1500, newRating: 1508, change: 8 } });
        const { game, white, black } = await ctx.seatedGame({
            moveLog: MOVE_LOG,
            fen: AFTER_E4,
            whiteClockMs: 123456.6,
            blackClockMs: 98765.4,
        });
        supabase.queue('games', { data: { id: game.id }, error: null });
        const ended = once(black, 'game_end');
        const ratedWhite = once(white, 'rating_updated');
        const ratedBlack = once(black, 'rating_updated');
        white.emit('game_end', {
            game_id: game.id,
            result: 'White wins',
            reason: 'Resignation',
            white_id: 'evil',
            black_id: 'evil',
            extra: 1,
        });
        const payload = await ended;

        expect(payload).toEqual({
            game_id: game.id,
            result: 'White wins',
            reason: 'Resignation',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        expect(await ratedBlack).toEqual({ white: { oldRating: 1500, newRating: 1508, change: 8 } });
        await ratedWhite;

        // Reason is NOT stored in Redis (stays null).
        expect(await getGame(game.id)).toEqual({ ...game, status: 'completed', result: 'white' });
        expect(await getActiveGameIds()).toEqual([]);

        expect(opsFor('games')).toEqual([
            [
                [
                    'update',
                    {
                        status: 'completed',
                        result: null,
                        winner_id: 'white-user',
                        ended_at: ISO_DATE,
                        final_fen: AFTER_E4,
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ game_id: game.id, pgn: PGN, time_control: '10' }),
                },
            ],
        ]);
        expect(rating.processGameEnd.mock.calls).toEqual([[game.id, 'white-user', 'black-user', 'white', '10', true]]);
        // Review is fired before rating is processed.
        const reviewOrder = ctx.fetch.mock.invocationCallOrder[ctx.fetch.mock.calls.findIndex(([u]) => String(u).endsWith('/analyse-game'))];
        expect(reviewOrder).toBeLessThan(rating.processGameEnd.mock.invocationCallOrder[0]);
    });

    test('ENGINE_URL is used for the review trigger', async () => {
        process.env.ENGINE_URL = 'http://engine.test:9000';
        await endGame({ result: 'Draw' });
        await waitFor(() => reviewCalls().length === 1, 500, 'review');
        expect(reviewCalls()[0][0]).toBe('http://engine.test:9000/analyse-game');
    });

    test.each([
        ['White wins', 'white', 'white-user', null],
        ['BLACK WINS on time', 'black', 'black-user', null],
        ['Draw', 'draw', null, 'draw'],
        ['Stalemate', 'draw', null, 'draw'],
        [undefined, 'draw', null, 'draw'],
        // `includes('white')` is checked first, so these read as WHITE wins (pinned).
        ['White resigned', 'white', 'white-user', null],
        ['black beat white', 'white', 'white-user', null],
    ])('result %p → outcome %p (winner_id %p, result column %p)', async (result, outcome, winnerId, resultColumn) => {
        const { game } = await endGame({ result });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect((await getGame(game.id)).result).toBe(outcome);
        expect(supabase.op(supabase.callsFor('games')[0], 'update')[0]).toMatchObject({ winner_id: winnerId, result: resultColumn });
        expect(rating.processGameEnd.mock.calls[0][3]).toBe(outcome);
    });

    test('time_control / is_rated fall back to the CLIENT payload when Redis lacks them', async () => {
        const { game } = await endGame(
            { result: 'Draw', time_control: '3+2', is_rated: true },
            { timeControl: undefined, isRated: undefined },
        );
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(rating.processGameEnd.mock.calls[0]).toEqual([game.id, 'white-user', 'black-user', 'draw', '3+2', true]);
        expect(JSON.parse(reviewCalls()[0][1].body).time_control).toBe('3+2');
    });

    test('defaults: time_control "10", is_rated false; missing fen/clocks → null / 0', async () => {
        const { game } = await endGame(
            { result: 'Draw' },
            { timeControl: undefined, isRated: undefined, fen: undefined, whiteClockMs: undefined, blackClockMs: undefined },
        );
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(rating.processGameEnd.mock.calls[0]).toEqual([game.id, 'white-user', 'black-user', 'draw', '10', false]);
        expect(supabase.op(supabase.callsFor('games')[0], 'update')[0]).toMatchObject({
            final_fen: null,
            white_clock_ms: 0,
            black_clock_ms: 0,
        });
        expect(JSON.parse(reviewCalls()[0][1].body).time_control).toBe('10');
    });

    test('clocks are written from Redis as-is (time since lastMoveAt is not deducted)', async () => {
        await endGame({ result: 'Draw' }, { whiteClockMs: 50000, lastMoveAt: Date.now() - 20000 });
        expect(supabase.op(supabase.callsFor('games')[0], 'update')[0].white_clock_ms).toBe(50000);
    });

    test('no moves → no review request; rating still processed', async () => {
        await endGame({ result: 'Draw' }, { moveLog: [] });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(reviewCalls()).toEqual([]);
    });

    test('rating returning null → no rating_updated', async () => {
        const { ratingEvents } = await endGame({ result: 'Draw' });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        await sleep(50);
        expect(ratingEvents).toEqual([]);
    });

    test('DB says already finalized → still broadcast, but no review and no rating', async () => {
        await endGame({ result: 'White wins' }, {}, { data: null, error: null });
        await sleep(80);
        expect(reviewCalls()).toEqual([]);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
    });

    test('any signed-in socket — even outside the room — can end a game (BUG pinned; fixed by S3)', async () => {
        const { game, white, black } = await ctx.seatedGame();
        supabase.queue('games', { data: { id: game.id }, error: null });
        const anon = await ctx.connect();
        const seen = once(white, 'game_end');
        const anonGot = record(anon, 'game_end');
        anon.emit('game_end', { game_id: game.id, result: 'Black wins', reason: 'Resignation' });
        expect(await seen).toEqual({
            game_id: game.id,
            result: 'Black wins',
            reason: 'Resignation',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        await sleep(50);
        expect(anonGot).toEqual([]);
        expect((await getGame(game.id)).result).toBe('black');
        expect(black.connected).toBe(true);
    });

    test('after game_end, re-joining shows the stored result with reason "Game over"', async () => {
        const { game } = await endGame({ result: 'Black wins', reason: 'Checkmate' });
        const late = await ctx.connect();
        late.emit('join_game', game.id);
        expect(await once(late, 'game_end')).toEqual({
            game_id: game.id,
            result: 'Black wins',
            reason: 'Game over',
            white_id: 'white-user',
            black_id: 'black-user',
        });
    });

    test('inactive / unknown / player-less games are ignored with no DB calls', async () => {
        const { game, white, black } = await ctx.seatedGame({ blackId: null });
        const ends = record(black, 'game_end');
        white.emit('game_end', { game_id: game.id, result: 'White wins' });
        white.emit('game_end', { game_id: 'unknown', result: 'White wins' });
        await sleep(100);
        expect(ends).toEqual([]);
        expect(opsFor('games')).toEqual([]);
        expect((await getGame(game.id)).status).toBe('active');
    });
});
