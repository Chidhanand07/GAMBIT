/**
 * Characterization: rematch and challenge socket events. All of them trust the
 * user ids in the client payload (known bug, pinned). Private games are created
 * through the real friends service against the Supabase mock.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const redis = require('../../lib/redis');
const { getGame } = require('../../lib/gameStore');
const { useServer, once, record, recordAll, sleep, opsFor, compact, ISO_DATE, START_FEN } = require('./harness');

const ctx = useServer();

const TOKEN = expect.stringMatching(/^[A-Za-z0-9_-]{10}$/);
const BY_TOKEN_SELECT = '*,white:profiles!white_id(username,avatar_url),black:profiles!black_id(username,avatar_url)';

/**
 * Queue the three `games` results createPrivateGame + joinPrivateGame need:
 * insert → row, select-by-token → row, update → joined row.
 */
function queuePrivateGameFlow(gameId) {
    let row;
    supabase.queue(
        'games',
        (call) => {
            row = { id: gameId, ...supabase.op(call, 'insert')[0] };
            return { data: row, error: null };
        },
        () => ({ data: row, error: null }),
        (call) => ({ data: { ...row, ...supabase.op(call, 'update')[0] }, error: null }),
    );
}

/** Assert the exact create → lookup → join DB sequence. */
function expectPrivateGameOps({ gameId, host, hostColor, joiner, timeControl, isRated }) {
    const white = hostColor === 'white' ? host : joiner;
    const black = hostColor === 'white' ? joiner : host;
    const calls = opsFor('games');
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([
        [
            'insert',
            {
                white_id: hostColor === 'white' ? host : null,
                black_id: hostColor === 'black' ? host : null,
                time_control: timeControl,
                status: 'waiting',
                invite_token: TOKEN,
                invite_expires_at: ISO_DATE,
                is_rated: isRated,
            },
        ],
        ['select'],
        ['single'],
    ]);
    const token = calls[0][0][1].invite_token;
    expect(calls[1].map((op) => (op[0] === 'select' ? ['select', compact(op[1])] : op))).toEqual([
        ['select', BY_TOKEN_SELECT],
        ['eq', 'invite_token', token],
        ['maybeSingle'],
    ]);
    expect(calls[2]).toEqual([
        ['update', { white_id: white, black_id: black, status: 'active', started_at: ISO_DATE }],
        ['eq', 'id', gameId],
        ['eq', 'status', 'waiting'],
        ['select'],
        ['maybeSingle'],
    ]);
}

describe('rematch', () => {
    test('rematch_request is forwarded to user_<to_user_id> only, without unknown keys', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const aliceGot = record(alice, 'rematch_request');
        const data = { from_user_id: 'alice', to_user_id: 'bob', time_control: '5', is_rated: true, from_username: 'Alice', x: 1 };
        const p = once(bob, 'rematch_request');
        alice.emit('rematch_request', data);
        expect(await p).toEqual({ ...data, x: undefined });
        await sleep(30);
        expect(aliceGot).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });

    test('rematch_accept creates a random-colour private game for the requester, joins the accepter, and notifies both', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        queuePrivateGameFlow('rm-1');
        jest.spyOn(Math, 'random').mockReturnValue(0.9); // > 0.5 → requester is white
        const toAlice = once(alice, 'rematch_ready');
        const toBob = once(bob, 'rematch_ready');
        // The accepter is the verified sender; a `to_user_id` in the payload is ignored [S2].
        bob.emit('rematch_accept', { from_user_id: 'alice', to_user_id: 'mallory', time_control: '5+3', is_rated: false });

        expect(await toAlice).toEqual({ game_id: 'rm-1' });
        expect(await toBob).toEqual({ game_id: 'rm-1' });
        expectPrivateGameOps({ gameId: 'rm-1', host: 'alice', hostColor: 'white', joiner: 'bob', timeControl: '5+3', isRated: false });
        expect(await getGame('rm-1')).toEqual({
            id: 'rm-1',
            fen: START_FEN,
            whiteId: 'alice',
            blackId: 'bob',
            whiteClockMs: 300000,
            blackClockMs: 300000,
            activeSide: 'w',
            status: 'active',
            result: null,
            reason: null,
            moveLog: [],
            timeControl: '5+3',
            incrementMs: 3000,
            isRated: false,
            lastMoveAt: null,
            disconnectInfo: null,
        });
        expect([...redis._sets.get('active_games')]).toEqual(['rm-1']);
    });

    test('rematch_accept with Math.random() <= 0.5 makes the requester black', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        queuePrivateGameFlow('rm-2');
        jest.spyOn(Math, 'random').mockReturnValue(0.2);
        const p = once(alice, 'rematch_ready');
        bob.emit('rematch_accept', { from_user_id: 'alice', time_control: '10', is_rated: true });
        await p;
        expectPrivateGameOps({ gameId: 'rm-2', host: 'alice', hostColor: 'black', joiner: 'bob', timeControl: '10', isRated: true });
    });

    test('rematch_accept DB failure → error logged, nothing emitted', async () => {
        const alice = await ctx.connect('alice');
        const events = recordAll(alice);
        supabase.queue('games', { data: null, error: { message: 'insert failed' } });
        alice.emit('rematch_accept', { from_user_id: 'alice', to_user_id: 'bob', time_control: '10', is_rated: true });
        await sleep(80);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([]);
        expect(opsFor('games')).toHaveLength(1);
    });

    test('rematch_decline sends rematch_declined with no payload to user_<to_user_id>', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const events = recordAll(alice);
        bob.emit('rematch_decline', { to_user_id: 'alice', from_user_id: 'bob' });
        await once(alice, 'rematch_declined');
        expect(events).toEqual([['rematch_declined']]);
    });
});

describe('challenges', () => {
    test('challenge_request forwards the payload and inserts a notification', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const data = {
            from_user_id: 'alice',
            to_user_id: 'bob',
            from_username: 'Alice',
            time_control: '3+2',
            is_rated: true,
            color: 'black',
            extra: 'dropped by the schema',
        };
        const p = once(bob, 'challenge_request');
        alice.emit('challenge_request', data);
        expect(await p).toEqual({ ...data, extra: undefined });
        await sleep(30);
        expect(opsFor('notifications')).toEqual([
            [
                [
                    'insert',
                    {
                        user_id: 'bob',
                        type: 'challenge',
                        payload: { from_user_id: 'alice', from_username: 'Alice', time_control: '3+2', is_rated: true, color: 'black' },
                        read: false,
                        created_at: ISO_DATE,
                    },
                ],
            ],
        ]);
    });

    test.each([
        // [color, Math.random, white, black]
        ['white', 0.1, 'alice', 'bob'],
        ['black', 0.9, 'bob', 'alice'],
        ['random', 0.9, 'alice', 'bob'],
        ['random', 0.5, 'bob', 'alice'],
        [undefined, 0.9, 'bob', 'alice'], // anything but 'white' makes the challenger black (pinned)
    ])('challenge_accept color %p (random=%p) → white %p, black %p', async (color, random, whiteId, blackId) => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        queuePrivateGameFlow('ch-1');
        jest.spyOn(Math, 'random').mockReturnValue(random);
        const toAlice = once(alice, 'challenge_ready');
        const toBob = once(bob, 'challenge_ready');
        bob.emit('challenge_accept', { from_user_id: 'alice', to_user_id: 'bob', time_control: '10', is_rated: true, color });
        expect(await toAlice).toEqual({ game_id: 'ch-1' });
        expect(await toBob).toEqual({ game_id: 'ch-1' });
        // The host is always created as white, then the other player joins as black.
        expectPrivateGameOps({ gameId: 'ch-1', host: whiteId, hostColor: 'white', joiner: blackId, timeControl: '10', isRated: true });
        expect(await getGame('ch-1')).toMatchObject({ whiteId, blackId, isRated: true, timeControl: '10' });
    });

    test('challenge_accept DB failure → nothing emitted', async () => {
        const alice = await ctx.connect('alice');
        const got = record(alice, 'challenge_ready');
        supabase.queue('games', { data: null, error: { message: 'boom' } });
        alice.emit('challenge_accept', { from_user_id: 'alice', to_user_id: 'bob', time_control: '10', is_rated: true, color: 'white' });
        await sleep(80);
        expect(got).toEqual([]);
    });

    test('challenge_decline sends { by: by_username } to user_<from_user_id>', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const p = once(alice, 'challenge_declined');
        bob.emit('challenge_decline', { from_user_id: 'alice', to_user_id: 'bob', by_username: 'Bob' });
        expect(await p).toEqual({ by: 'Bob' });
    });

    test('the sender of a challenge is the verified user, never the payload id [S2]', async () => {
        const bob = await ctx.connect('bob');
        const mallory = await ctx.connect('mallory');
        const p = once(bob, 'challenge_request');
        mallory.emit('challenge_request', { from_user_id: 'impersonated', to_user_id: 'bob' });
        expect(await p).toEqual({ from_user_id: 'mallory', to_user_id: 'bob' });
        await sleep(30);
        expect(supabase.op(supabase.callsFor('notifications')[0], 'insert')[0].payload.from_user_id).toBe('mallory');
    });

    test('an unauthenticated client cannot connect, so it cannot send social events [S2]', async () => {
        const bob = await ctx.connect('bob');
        const got = record(bob, 'challenge_request');
        const anon = ctx.open(undefined);
        expect((await once(anon, 'connect_error')).message).toBe('unauthorized');
        anon.emit('challenge_request', { from_user_id: 'alice', to_user_id: 'bob' });
        await sleep(50);
        expect(got).toEqual([]);
    });
});
