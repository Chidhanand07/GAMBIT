/**
 * Characterization: disconnect bookkeeping and the global clock ticker
 * (clock_sync, 20 s abandonment, flag fall). The ticker runs every 1000 ms of
 * real time; instead of waiting 20 s we put old timestamps into Redis.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn() }));

const { supabase } = require('../../supabase');
const rating = require('../../services/rating');
const { getGame, setGame, getActiveGameIds } = require('../../lib/gameStore');
const { useServer, once, record, recordAll, sleep, waitFor, opsFor, ISO_DATE, AFTER_E4, TICK_TIMEOUT_MS } = require('./harness');

const ctx = useServer();

const MOVE_LOG = [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }];
const CHANGES = { white: { oldRating: 1500, newRating: 1490, change: -10 }, black: { oldRating: 1500, newRating: 1510, change: 10 } };
const GRACE_EXPIRED_MS = 21000;
/** Long enough for at least one full tick of the 1000 ms global clock. */
const ONE_TICK_MS = 1300;

beforeEach(() => {
    rating.processGameEnd.mockReset();
    rating.processGameEnd.mockResolvedValue(CHANGES);
});

/** Patch the Redis state of a seated game. */
async function patchGame(id, patch) {
    const next = { ...(await getGame(id)), ...patch };
    await setGame(id, next);
    return next;
}

const reviewCalls = () => ctx.fetch.mock.calls.filter(([url]) => String(url).endsWith('/analyse-game'));

function finalizeOps(gameId, winnerId, fen) {
    return [
        [
            'update',
            { status: 'completed', winner_id: winnerId, ended_at: ISO_DATE, final_fen: fen },
        ],
        ['eq', 'id', gameId],
        ['eq', 'status', 'active'],
        ['select', 'id'],
        ['maybeSingle'],
    ];
}

describe('disconnect during an active game', () => {
    test('snapshots the clock, writes the canonical white_clock_ms/black_clock_ms, stores disconnectInfo, notifies the room [G2]', async () => {
        const { game, white, black } = await ctx.seatedGame({ whiteClockMs: 60000 });
        const T = Date.now();
        const before = await patchGame(game.id, { lastMoveAt: T - 5000 });
        jest.spyOn(Date, 'now').mockReturnValue(T);

        const notice = once(black, 'opponent_disconnected');
        white.disconnect();
        expect(await notice).toEqual({ userId: 'white-user', timeoutSeconds: 20 });

        // lastMoveAt is left untouched although the clock was already snapshotted.
        expect(await getGame(game.id)).toEqual({
            ...before,
            whiteClockMs: 55000,
            blackClockMs: 600000,
            disconnectInfo: { userId: 'white-user', side: 'white', at: T },
        });
        await sleep(20);
        expect(opsFor('games')).toEqual([
            [
                ['update', { white_clock_ms: 55000, black_clock_ms: 600000 }],
                ['eq', 'id', game.id],
                ['eq', 'status', 'active'],
            ],
        ]);

        // While paused, clock_sync subtracts the elapsed time AGAIN from the snapshot (pinned).
        expect(await once(black, 'clock_sync', TICK_TIMEOUT_MS)).toEqual({ whiteMs: 50000, blackMs: 600000, serverTs: T });
    });

    test('black disconnecting → side "black"; clocks rounded in the DB snapshot', async () => {
        const { game, white, black } = await ctx.seatedGame({ activeSide: 'b', blackClockMs: 30000.4, whiteClockMs: 1234.6 });
        const notice = once(white, 'opponent_disconnected');
        black.disconnect();
        expect(await notice).toEqual({ userId: 'black-user', timeoutSeconds: 20 });
        expect((await getGame(game.id)).disconnectInfo).toEqual({ userId: 'black-user', side: 'black', at: expect.any(Number) });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('games')[0], 'update')[0]).toEqual({ white_clock_ms: 1235, black_clock_ms: 30000 });
    });

    test('a non-player who joined the room is a spectator: their disconnect changes nothing [S9]', async () => {
        const { game, black } = await ctx.seatedGame();
        const stranger = await ctx.connect('stranger');
        stranger.emit('join_game', game.id);
        // Spectators still receive the state.
        expect(await once(stranger, 'game_state_sync')).toMatchObject({ whiteId: 'white-user', blackId: 'black-user' });
        const notices = record(black, 'opponent_disconnected');
        stranger.disconnect();
        await sleep(80);
        expect(notices).toEqual([]);
        expect((await getGame(game.id)).disconnectInfo).toBeNull();
        expect(supabase.calls).toEqual([]);
    });

    test('completed game or a user without a game → no notice, no DB write', async () => {
        const { game, white, black } = await ctx.seatedGame();
        await patchGame(game.id, { status: 'completed' });
        const anon = await ctx.connect();
        const notices = record(black, 'opponent_disconnected');
        white.disconnect();
        anon.disconnect();
        await sleep(80);
        expect(notices).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });
});

describe('global clock ticker', () => {
    test('emits clock_sync { whiteMs, blackMs, serverTs } to the game room for running clocks', async () => {
        const { game, white } = await ctx.seatedGame({ activeSide: 'b', blackClockMs: 90000, whiteClockMs: 80000 });
        const T = Date.now();
        await patchGame(game.id, { lastMoveAt: T - 5000 });
        jest.spyOn(Date, 'now').mockReturnValue(T);
        expect(await once(white, 'clock_sync', TICK_TIMEOUT_MS)).toEqual({ whiteMs: 80000, blackMs: 85000, serverTs: T });
    });

    test('no clock_sync before the first move (lastMoveAt null)', async () => {
        const { white } = await ctx.seatedGame({ lastMoveAt: null });
        const syncs = record(white, 'clock_sync');
        await sleep(ONE_TICK_MS);
        expect(syncs).toEqual([]);
    });

    test.each([
        ['white', 'Black wins', 'black', 'black-user'],
        ['black', 'White wins', 'white', 'white-user'],
    ])('%s abandoned (disconnectInfo ≥ 20 s old) → %s', async (side, text, outcome, winnerId) => {
        const { game, white, black } = await ctx.seatedGame({ moveLog: MOVE_LOG, fen: AFTER_E4 });
        const before = await patchGame(game.id, {
            lastMoveAt: Date.now() - 1000,
            disconnectInfo: { userId: `${side}-user`, side, at: Date.now() - GRACE_EXPIRED_MS },
        });
        supabase.queue('games', { data: { id: game.id }, error: null });
        const watcher = side === 'white' ? black : white;
        const events = recordAll(watcher);

        const ended = await once(watcher, 'game_end', TICK_TIMEOUT_MS);
        expect(ended).toEqual({
            game_id: game.id,
            result: text,
            reason: 'Abandonment',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        await waitFor(() => events.some(([e]) => e === 'rating_updated'), 500, 'rating_updated');

        expect(events.filter(([e]) => e !== 'queue_status').map(([e]) => e)).toEqual(['clock_sync', 'game_end', 'rating_updated']);
        expect(events.find(([e]) => e === 'rating_updated')[1]).toEqual(CHANGES);
        expect(await getGame(game.id)).toEqual({ ...before, status: 'completed', result: outcome });
        expect(await getActiveGameIds()).toEqual([]);
        expect(opsFor('games')).toEqual([finalizeOps(game.id, winnerId, AFTER_E4)]);
        expect(rating.processGameEnd.mock.calls).toEqual([[game.id, 'white-user', 'black-user', outcome, '10', true]]);
        // finalizeExpiredGame never triggers a game review (BUG pinned).
        expect(reviewCalls()).toEqual([]);
    });

    test('a disconnect inside the 20 s grace period only pauses (no game_end)', async () => {
        const { game, black } = await ctx.seatedGame();
        await patchGame(game.id, {
            lastMoveAt: Date.now(),
            disconnectInfo: { userId: 'white-user', side: 'white', at: Date.now() - 5000 },
        });
        const ends = record(black, 'game_end');
        await once(black, 'clock_sync', TICK_TIMEOUT_MS);
        await sleep(50);
        expect(ends).toEqual([]);
        expect((await getGame(game.id)).status).toBe('active');
    });

    test('a disconnect before the first move is never adjudicated (lastMoveAt null, BUG pinned)', async () => {
        const { game, black } = await ctx.seatedGame({ lastMoveAt: null });
        await patchGame(game.id, { disconnectInfo: { userId: 'white-user', side: 'white', at: Date.now() - 60000 } });
        const ends = record(black, 'game_end');
        await sleep(ONE_TICK_MS);
        expect(ends).toEqual([]);
        expect((await getGame(game.id)).status).toBe('active');
        expect(supabase.calls).toEqual([]);
    });

    test.each([
        { activeSide: 'w', text: 'Black wins', outcome: 'black', winnerId: 'black-user', clocks: { whiteMs: 0, blackMs: 600000 } },
        { activeSide: 'b', text: 'White wins', outcome: 'white', winnerId: 'white-user', clocks: { whiteMs: 600000, blackMs: 0 } },
    ])('flag fall with $activeSide to move → $text on time', async ({ activeSide, text, outcome, winnerId, clocks }) => {
        const { game, white, black } = await ctx.seatedGame({ moveLog: MOVE_LOG, activeSide });
        const before = await patchGame(game.id, { lastMoveAt: Date.now() - 700000 });
        supabase.queue('games', { data: { id: game.id }, error: null });
        const events = recordAll(black);
        const whiteEnd = once(white, 'game_end', TICK_TIMEOUT_MS);

        const ended = await once(black, 'game_end', TICK_TIMEOUT_MS);
        const expected = {
            game_id: game.id,
            result: text,
            reason: 'Time',
            white_id: 'white-user',
            black_id: 'black-user',
            is_rated: true,
            time_control: '10',
        };
        expect(ended).toEqual(expected);
        expect(await whiteEnd).toEqual(expected);
        await waitFor(() => events.some(([e]) => e === 'rating_updated'), 500, 'rating_updated');

        const relevant = events.filter(([e]) => e !== 'queue_status');
        expect(relevant[0]).toEqual(['clock_sync', { ...clocks, serverTs: expect.any(Number) }]);
        expect(relevant.map(([e]) => e)).toEqual(['clock_sync', 'game_end', 'rating_updated']);
        expect(await getGame(game.id)).toEqual({ ...before, status: 'completed', result: outcome });
        expect(await getActiveGameIds()).toEqual([]);
        // final_fen is the Redis fen; clocks and result columns are not written on timeout.
        expect(opsFor('games')).toEqual([finalizeOps(game.id, winnerId, game.fen)]);
        expect(rating.processGameEnd.mock.calls).toEqual([[game.id, 'white-user', 'black-user', outcome, '10', true]]);
        expect(reviewCalls()).toEqual([]);
    });

    test('flag fall passes Redis timeControl / isRated through to the payload and rating', async () => {
        const { game, black } = await ctx.seatedGame({ timeControl: '3+2', isRated: false });
        await patchGame(game.id, { lastMoveAt: Date.now() - 700000 });
        supabase.queue('games', { data: { id: game.id }, error: null });
        expect(await once(black, 'game_end', TICK_TIMEOUT_MS)).toMatchObject({ is_rated: false, time_control: '3+2' });
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        expect(rating.processGameEnd.mock.calls[0]).toEqual([game.id, 'white-user', 'black-user', 'black', '3+2', false]);
    });

    test('already finalized in DB → game_end still broadcast, but no rating', async () => {
        const { game, black } = await ctx.seatedGame();
        await patchGame(game.id, { lastMoveAt: Date.now() - 700000 });
        supabase.queue('games', { data: null, error: null });
        const rated = record(black, 'rating_updated');
        await once(black, 'game_end', TICK_TIMEOUT_MS);
        await sleep(80);
        expect(opsFor('games')).toHaveLength(1);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
        expect(rated).toEqual([]);
    });

    test('rating returning null → no rating_updated', async () => {
        rating.processGameEnd.mockResolvedValue(null);
        const { game, black } = await ctx.seatedGame();
        await patchGame(game.id, { lastMoveAt: Date.now() - 700000 });
        supabase.queue('games', { data: { id: game.id }, error: null });
        const rated = record(black, 'rating_updated');
        await once(black, 'game_end', TICK_TIMEOUT_MS);
        await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
        await sleep(50);
        expect(rated).toEqual([]);
    });
});
