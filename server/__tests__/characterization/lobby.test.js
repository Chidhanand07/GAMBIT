/**
 * Characterization: matchmaking over sockets (join_queue, leave_queue,
 * queue_status broadcast, pairing → match_found, games insert, Redis state).
 * The matchmaking loop ticks every 1000 ms of real time.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const redis = require('../../lib/redis');
const { getGame } = require('../../lib/gameStore');
const { useServer, once, record, sleep, waitFor, opsFor, ISO_DATE, START_FEN, TICK_TIMEOUT_MS } = require('./harness');

const ctx = useServer();

const PROFILE_COLUMNS = 'id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical, games_played';

function profile(id, overrides = {}) {
    return {
        id,
        username: `${id}-name`,
        rating_bullet: 1001,
        rating_blitz: 1002,
        rating_rapid: 1003,
        rating_classical: 1004,
        games_played: 20,
        ...overrides,
    };
}

/** Connect a socket and put `id` in the queue with the given profile row. */
async function queued(id, joinData = {}, profileOverrides = {}) {
    const s = await ctx.connect(id);
    supabase.queue('profiles', { data: profile(id, profileOverrides), error: null });
    s.emit('join_queue', { user: { id }, time_control: '10', ...joinData });
    const joined = await once(s, 'queue_joined');
    return { s, joined };
}

describe('join_queue', () => {
    test('emits queue_joined with position and a fixed estimated wait', async () => {
        const { joined } = await queued('q1');
        expect(joined).toEqual({ position: 1, estimated_wait: 10 });
        const { joined: second } = await queued('q2');
        expect(second).toEqual({ position: 2, estimated_wait: 10 });
    });

    test('looks the profile up by id with a fixed column list', async () => {
        await queued('q1');
        expect(opsFor('profiles')).toEqual([[['select', PROFILE_COLUMNS], ['eq', 'id', 'q1'], ['maybeSingle']]]);
    });

    test('stores the verified queue entry (client rating ignored; client increment / is_rated passed through)', async () => {
        const { s } = await queued('q1', { user: { id: 'q1', rating: 3000 }, time_control: '3+2', increment: 2, is_rated: false });
        expect(ctx.matchmaking.queue.get('q1')).toEqual({
            user_id: 'q1',
            username: 'q1-name',
            rating: 1002,
            isProvisional: false,
            time_control: '3+2',
            increment: 2,
            isRated: false,
            joined_at: expect.any(Number),
            socketId: s.id,
        });
    });

    test.each([
        ['1', 1001],
        ['2+1', 1001],
        ['3', 1002],
        ['5+3', 1002],
        ['10', 1003],
        ['29', 1003],
        ['30', 1004], // one threshold set for server and web: 30 minutes is classical (F7)
        ['60', 1004],
        ['90+30', 1004],
        [undefined, 1003], // no time control → the default 10+0
    ])('time_control %p reads rating %p', async (timeControl, rating) => {
        const s = await ctx.connect('tc');
        supabase.queue('profiles', { data: profile('tc'), error: null });
        s.emit('join_queue', { user: { id: 'tc' }, time_control: timeControl });
        await once(s, 'queue_joined');
        expect(ctx.matchmaking.queue.get('tc').rating).toBe(rating);
    });

    test.each(['blitz', '0', '-5', '1441', '10+181', 'x'])(
        'time_control %p is rejected: not queued, invalid_payload ack [TIME-CONTROL]',
        async (timeControl) => {
            const s = await ctx.connect('tc');
            const ack = await new Promise((resolve) => s.emit('join_queue', { time_control: timeControl }, resolve));
            expect(ack).toEqual({ ok: false, error: 'invalid_payload' });
            expect(ctx.matchmaking.queue.has('tc')).toBe(false);
        },
    );

    test('missing rating column → 1200; missing games_played → 0 (provisional); is_rated null → true', async () => {
        await queued('q1', { is_rated: null }, { rating_rapid: null, games_played: null });
        expect(ctx.matchmaking.queue.get('q1')).toMatchObject({ rating: 1200, isProvisional: true, isRated: true });
    });

    test('rating 0 in the DB becomes 1200 inside matchmaking (`|| 1200`)', async () => {
        await queued('q1', {}, { rating_rapid: 0 });
        expect(ctx.matchmaking.queue.get('q1').rating).toBe(1200);
    });

    test('the queued player is the verified user: no payload id is needed, and a foreign one is ignored [S2]', async () => {
        const s = await ctx.connect('q1');
        supabase.queue('profiles', { data: profile('q1'), error: null });
        s.emit('join_queue', { user: { id: 'someone-else' }, time_control: '10' });
        await once(s, 'queue_joined');
        expect(opsFor('profiles')).toEqual([[['select', PROFILE_COLUMNS], ['eq', 'id', 'q1'], ['maybeSingle']]]);
        expect([...ctx.matchmaking.queue.keys()]).toEqual(['q1']);
    });

    test('a null payload is rejected: nothing is looked up or queued [S15]', async () => {
        const s = await ctx.connect('q1');
        const joined = record(s, 'queue_joined');
        s.emit('join_queue', null);
        await sleep(80);
        expect(supabase.calls).toEqual([]);
        expect(joined).toEqual([]);
    });

    test('unknown profile → lookup happens but nothing is queued or emitted', async () => {
        const s = await ctx.connect('ghost');
        const joined = record(s, 'queue_joined');
        s.emit('join_queue', { user: { id: 'ghost' }, time_control: '10' });
        await sleep(80);
        expect(opsFor('profiles')).toHaveLength(1);
        expect(joined).toEqual([]);
        expect(ctx.matchmaking.queue.size).toBe(0);
    });

    test('joining twice re-queries the DB but keeps the first entry and emits nothing new', async () => {
        const { s } = await queued('q1');
        const first = ctx.matchmaking.queue.get('q1');
        const joined = record(s, 'queue_joined');
        supabase.queue('profiles', { data: profile('q1', { rating_rapid: 2500 }), error: null });
        s.emit('join_queue', { user: { id: 'q1' }, time_control: '5' });
        await sleep(80);
        expect(opsFor('profiles')).toHaveLength(2);
        expect(joined).toEqual([]);
        expect(ctx.matchmaking.queue.get('q1')).toEqual(first);
    });
});

describe('leave_queue and queue_status', () => {
    test('leave_queue removes only the caller; another socket cannot remove someone else [G13]', async () => {
        const { s } = await queued('q1');
        const stranger = await ctx.connect();
        stranger.emit('leave_queue', 'q1');
        await sleep(50);
        expect(ctx.matchmaking.queue.has('q1')).toBe(true);
        s.emit('leave_queue');
        await sleep(50);
        expect(ctx.matchmaking.queue.has('q1')).toBe(false);
    });

    test('leave_queue emits nothing back', async () => {
        const { s } = await queued('q1');
        const got = [];
        s.onAny((event, ...args) => event !== 'queue_status' && got.push([event, ...args]));
        s.emit('leave_queue', 'q1');
        await sleep(50);
        expect(got).toEqual([]);
    });

    test('every tick broadcasts queue_status to all connected sockets', async () => {
        await queued('q1');
        const watcher = await ctx.connect();
        expect(await once(watcher, 'queue_status', TICK_TIMEOUT_MS)).toEqual({ players_searching: 1 });
    });

    test('disconnecting only removes the disconnecting socket\'s queue entries', async () => {
        const { s } = await queued('q1');
        await queued('q2', { time_control: '5' });
        s.disconnect();
        await sleep(50);
        expect([...ctx.matchmaking.queue.keys()]).toEqual(['q2']);
    });
});

describe('pairing', () => {
    function gameRowFrom(call) {
        return { data: { id: 'match-1', created_at: '2026-01-01T00:00:00.000Z', ...supabase.op(call, 'insert')[0] }, error: null };
    }

    async function pairUp(random, p1Join = {}, p2Join = {}) {
        // Arrange the DB result and colour coin before p2 joins: a tick may pair them immediately.
        supabase.queue('games', gameRowFrom);
        jest.spyOn(Math, 'random').mockReturnValue(random);
        const { s: s1 } = await queued('p1', p1Join, { rating_rapid: 1500 });
        const { s: s2 } = await queued('p2', p2Join, { rating_rapid: 1520 });
        const [m1, m2] = await Promise.all([once(s1, 'match_found', TICK_TIMEOUT_MS), once(s2, 'match_found', TICK_TIMEOUT_MS)]);
        return { s1, s2, m1, m2 };
    }

    function entry(id, socketId, rating, extra = {}) {
        return {
            user_id: id,
            username: `${id}-name`,
            rating,
            isProvisional: false,
            time_control: '10+0',
            increment: 0,
            isRated: true,
            joined_at: expect.any(Number),
            socketId,
            ...extra,
        };
    }

    test('Math.random() <= 0.5 → the later player is white', async () => {
        const { m1, m2 } = await pairUp(0.5);
        expect(m1).toMatchObject({ white_id: 'p2', black_id: 'p1', color: 'black', opponent: { user_id: 'p2' } });
        expect(m2).toMatchObject({ white_id: 'p2', black_id: 'p1', color: 'white', opponent: { user_id: 'p1' } });
    });

    test('Math.random() > 0.5 → longest-waiting player is white; exact match_found, games insert and Redis state', async () => {
        const { s1, s2, m1, m2 } = await pairUp(0.9);
        const row = {
            id: 'match-1',
            created_at: '2026-01-01T00:00:00.000Z',
            white_id: 'p1',
            black_id: 'p2',
            time_control: '10+0',
            increment: 0,
            status: 'active',
            started_at: ISO_DATE,
        };
        // NOTE pinned: `opponent` is the raw queue entry, leaking the opponent's socketId.
        expect(m1).toEqual({ ...row, color: 'white', opponent: entry('p2', s2.id, 1520) });
        expect(m2).toEqual({ ...row, color: 'black', opponent: entry('p1', s1.id, 1500) });
        expect(ctx.matchmaking.queue.size).toBe(0);

        expect(opsFor('games')).toEqual([
            [
                [
                    'insert',
                    {
                        white_id: 'p1',
                        black_id: 'p2',
                        time_control: '10+0',
                        increment: 0,
                        status: 'active',
                        started_at: ISO_DATE,
                    },
                ],
                ['select'],
                ['single'],
            ],
        ]);
        expect(await getGame('match-1')).toEqual({
            id: 'match-1',
            fen: START_FEN,
            startFen: START_FEN,
            whiteId: 'p1',
            blackId: 'p2',
            whiteClockMs: 600000,
            blackClockMs: 600000,
            activeSide: 'w',
            status: 'active',
            result: null,
            reason: null,
            moveLog: [],
            timeControl: '10+0',
            incrementMs: 0,
            isRated: true,
            lastMoveAt: null,
            disconnectInfo: null,
        });
        expect([...redis._sets.get('active_games')]).toEqual(['match-1']);
    });

    test('different increments are never paired; the same increment sent separately is kept [G4]', async () => {
        const { s: s1 } = await queued('p1', { increment: 0 });
        const { s: s2 } = await queued('p2', { increment: 5 });
        const found = [...record(s1, 'match_found'), ...record(s2, 'match_found')];
        await once(s1, 'queue_status', TICK_TIMEOUT_MS);
        await once(s1, 'queue_status', TICK_TIMEOUT_MS);
        expect(found).toEqual([]);
        expect(ctx.matchmaking.queue.size).toBe(2);
    });

    test('"10" with a separate increment of 5 on both sides → a 10+5 game (the increment is no longer lost) [G4]', async () => {
        await pairUp(0.9, { increment: 5, is_rated: false }, { increment: 5, is_rated: true });
        expect(supabase.op(supabase.callsFor('games')[0], 'insert')[0]).toMatchObject({ increment: 5, time_control: '10+5' });
        expect(await getGame('match-1')).toMatchObject({ incrementMs: 5000, isRated: false, whiteClockMs: 600000 });
    });

    test('"5+3" time control → 5-minute clocks with a 3 s increment in Redis', async () => {
        await pairUp(0.9, { time_control: '5+3', increment: 3 }, { time_control: '5+3', increment: 3 });
        expect(await getGame('match-1')).toMatchObject({
            timeControl: '5+3',
            incrementMs: 3000,
            whiteClockMs: 300000,
            blackClockMs: 300000,
        });
    });

    test('"10" and "10+0" are the same time control and are paired [TIME-CONTROL]', async () => {
        await pairUp(0.9, { time_control: '10' }, { time_control: '10+0' });
        expect(ctx.matchmaking.queue.size).toBe(0);
        expect(await getGame('match-1')).toMatchObject({ timeControl: '10+0', incrementMs: 0 });
    });

    test('different base times are never paired', async () => {
        const { s: s1 } = await queued('p1', { time_control: '10' });
        const { s: s2 } = await queued('p2', { time_control: '5' });
        const found = [...record(s1, 'match_found'), ...record(s2, 'match_found')];
        await once(s1, 'queue_status', TICK_TIMEOUT_MS);
        await once(s1, 'queue_status', TICK_TIMEOUT_MS);
        expect(found).toEqual([]);
        expect(ctx.matchmaking.queue.size).toBe(2);
    });

    test('games insert failure drops BOTH players from the queue with no event (pinned)', async () => {
        supabase.queue('games', { data: null, error: { message: 'insert failed' } });
        const { s: s1 } = await queued('p1', {}, { rating_rapid: 1500 });
        const found = record(s1, 'match_found');
        const { s: s2 } = await queued('p2', {}, { rating_rapid: 1500 });
        const found2 = record(s2, 'match_found');
        await waitFor(() => opsFor('games').length === 1, TICK_TIMEOUT_MS, 'games insert');
        await sleep(50);
        expect(opsFor('games')).toHaveLength(1);
        expect(found).toEqual([]);
        expect(found2).toEqual([]);
        expect(ctx.matchmaking.queue.size).toBe(0);
        expect(redis._strings.size).toBe(0);
    });
});
