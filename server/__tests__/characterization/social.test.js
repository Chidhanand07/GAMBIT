/**
 * Rematch and challenge socket events through the real server.
 *
 * Updated for S2 + S4: the sender / answerer is the handshake-verified user, a
 * request is stored in Redis for 60 s, and an accept or decline only works
 * against a pending request, using the stored terms. Private games are created
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
const { log } = require('../../src/observability/log');

/** Emit with an ack callback and resolve with what the server acknowledged. */
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const NO_PENDING = { ok: false, error: 'no_pending_request' };

const ctx = useServer();

const TOKEN = expect.stringMatching(/^[A-Za-z0-9_-]{10}$/);
const BY_TOKEN_SELECT = '*,white:profiles!white_id(username,avatar_url),black:profiles!black_id(username,avatar_url)';

/**
 * Queue what createPrivateGame + joinPrivateGame read back [INV-TOKEN]:
 *   games:        insert → row, select-by-id → row, update → joined row
 *   game_invites: insert → ok,  select-by-token → { game_id, expires_at }
 * The games row never carries the token; the invite is its own row.
 */
function queuePrivateGameFlow(gameId) {
    let row;
    let invite;
    supabase.queue(
        'games',
        (call) => {
            row = { id: gameId, ...supabase.op(call, 'insert')[0] };
            return { data: row, error: null };
        },
        () => ({ data: row, error: null }),
        (call) => ({ data: { ...row, ...supabase.op(call, 'update')[0] }, error: null }),
    );
    supabase.queue(
        'game_invites',
        (call) => {
            invite = supabase.op(call, 'insert')[0];
            return { data: null, error: null };
        },
        () => ({ data: { game_id: invite.game_id, expires_at: invite.expires_at }, error: null }),
    );
}

/** Assert the exact create → store invite → look up by token → load game → join DB sequence. */
function expectPrivateGameOps({ gameId, host, hostColor, joiner, timeControl, isRated }) {
    const white = hostColor === 'white' ? host : joiner;
    const black = hostColor === 'white' ? joiner : host;
    const calls = opsFor('games');
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([
        [
            'insert',
            // No invite_token / invite_expires_at on the games row any more.
            {
                white_id: hostColor === 'white' ? host : null,
                black_id: hostColor === 'black' ? host : null,
                // The server stores the canonical "M+S" form [TIME-CONTROL].
                time_control: timeControl.includes('+') ? timeControl : `${timeControl}+0`,
                status: 'waiting',
                is_rated: isRated,
            },
        ],
        ['select'],
        ['single'],
    ]);

    const invites = opsFor('game_invites');
    expect(invites).toHaveLength(2);
    expect(invites[0]).toEqual([['insert', { game_id: gameId, token: TOKEN, expires_at: ISO_DATE }]]);
    const token = invites[0][0][1].token;
    expect(invites[1]).toEqual([['select', 'game_id, expires_at'], ['eq', 'token', token], ['maybeSingle']]);

    expect(calls[1].map((op) => (op[0] === 'select' ? ['select', compact(op[1])] : op))).toEqual([
        ['select', BY_TOKEN_SELECT],
        ['eq', 'id', gameId],
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
    /** alice asks bob for a rematch and bob has received the prompt. */
    async function rematchRequested(terms = { time_control: '5+3', is_rated: false }) {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const prompt = once(bob, 'rematch_request');
        alice.emit('rematch_request', { to_user_id: 'bob', from_username: 'Alice', ...terms });
        await prompt;
        return { alice, bob };
    }

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
        // Stored server-side: requester → target, with the proposed terms.
        expect(JSON.parse(redis._strings.get('pending:rematch:alice:bob'))).toEqual({ time_control: '5', is_rated: true });
    });

    test('rematch_accept creates a random-colour private game for the requester, joins the accepter, and notifies both', async () => {
        const { alice, bob } = await rematchRequested();
        queuePrivateGameFlow('rm-1');
        jest.spyOn(Math, 'random').mockReturnValue(0.9); // > 0.5 → requester is white
        const toAlice = once(alice, 'rematch_ready');
        const toBob = once(bob, 'rematch_ready');
        // The accepter is the verified sender; ids and terms in the accept payload are ignored [S2][S4].
        bob.emit('rematch_accept', { from_user_id: 'alice', to_user_id: 'mallory', time_control: '1', is_rated: true });

        expect(await toAlice).toEqual({ game_id: 'rm-1' });
        expect(await toBob).toEqual({ game_id: 'rm-1' });
        expectPrivateGameOps({ gameId: 'rm-1', host: 'alice', hostColor: 'white', joiner: 'bob', timeControl: '5+3', isRated: false });
        expect(await getGame('rm-1')).toEqual({
            id: 'rm-1',
            fen: START_FEN,
            startFen: START_FEN,
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
            startedAt: expect.any(Number),
        });
        expect([...redis._sets.get('active_games')]).toEqual(['rm-1']);
        expect(redis._strings.has('pending:rematch:alice:bob')).toBe(false);
    });

    test('rematch_accept with Math.random() <= 0.5 makes the requester black', async () => {
        const { alice, bob } = await rematchRequested({ time_control: '10', is_rated: true });
        queuePrivateGameFlow('rm-2');
        jest.spyOn(Math, 'random').mockReturnValue(0.2);
        const p = once(alice, 'rematch_ready');
        bob.emit('rematch_accept', { from_user_id: 'alice' });
        await p;
        expectPrivateGameOps({ gameId: 'rm-2', host: 'alice', hostColor: 'black', joiner: 'bob', timeControl: '10', isRated: true });
    });

    test('rematch_accept without a pending request creates no game [S4]', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const ready = [...[alice, bob].map((s) => record(s, 'rematch_ready'))];
        // Nobody asked: bob tries to force a rated game against alice.
        expect(await emitAck(bob, 'rematch_accept', { from_user_id: 'alice', time_control: '1', is_rated: true })).toEqual(NO_PENDING);
        await sleep(50);
        expect(ready).toEqual([[], []]);
        expect(supabase.calls).toEqual([]);
    });

    test('a third party cannot accept a request addressed to someone else [S4]', async () => {
        const { alice, bob } = await rematchRequested();
        const mallory = await ctx.connect('mallory');
        const ready = [alice, bob, mallory].map((s) => record(s, 'rematch_ready'));
        expect(await emitAck(mallory, 'rematch_accept', { from_user_id: 'alice', to_user_id: 'bob' })).toEqual(NO_PENDING);
        await sleep(50);
        expect(ready).toEqual([[], [], []]);
        expect(supabase.calls).toEqual([]);
        // The real request is untouched and bob can still accept it.
        expect(redis._strings.has('pending:rematch:alice:bob')).toBe(true);
    });

    test('a request can be accepted only once', async () => {
        const { alice, bob } = await rematchRequested();
        queuePrivateGameFlow('rm-3');
        const p = once(alice, 'rematch_ready');
        expect(await emitAck(bob, 'rematch_accept', { from_user_id: 'alice' })).toEqual({ ok: true });
        await p;
        expect(await emitAck(bob, 'rematch_accept', { from_user_id: 'alice' })).toEqual(NO_PENDING);
        expect(opsFor('games')).toHaveLength(3);
    });

    test('a request expires after 60 s', async () => {
        const { bob } = await rematchRequested();
        // Age the stored request instead of moving the clock (socket.io's own timers read Date.now).
        const stored = redis._strings.get('pending:rematch:alice:bob');
        const realNow = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(realNow - 60_000);
        await redis.set('pending:rematch:alice:bob', stored, 'EX', 60);
        Date.now.mockRestore();
        expect(await emitAck(bob, 'rematch_accept', { from_user_id: 'alice' })).toEqual(NO_PENDING);
        expect(supabase.calls).toEqual([]);
    });

    test('rematch_accept DB failure → error logged, internal_error acked, nothing emitted', async () => {
        // Each connection logs through its own child logger (socketId, userId) [OBSERVABILITY].
        const childLogger = log.child;
        const childErrors = [];
        jest.spyOn(log, 'child').mockImplementation((bindings) => {
            const child = childLogger.call(log, bindings);
            jest.spyOn(child, 'error').mockImplementation((...args) => childErrors.push([bindings, ...args]));
            return child;
        });
        const { alice, bob } = await rematchRequested({ time_control: '10', is_rated: true });
        const events = recordAll(alice);
        supabase.queue('games', { data: null, error: { message: 'insert failed' } });
        expect(await emitAck(bob, 'rematch_accept', { from_user_id: 'alice' })).toEqual({ ok: false, error: 'internal_error' });
        await sleep(50);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([]);
        expect(opsFor('games')).toHaveLength(1);
        // Was: log.error on the process logger, without the socket and user.
        expect(childErrors).toEqual([
            [{ socketId: bob.id, userId: 'bob' }, '[socket] rematch_accept failed:', 'insert failed'],
        ]);
        expect(log.error).not.toHaveBeenCalledWith('[socket] rematch_accept failed:', 'insert failed');
    });

    test('rematch_decline sends rematch_declined (no payload) to the REQUESTER and clears the request', async () => {
        const { alice, bob } = await rematchRequested();
        const events = recordAll(alice);
        const bobGot = record(bob, 'rematch_declined');
        bob.emit('rematch_decline', { from_user_id: 'alice' });
        await once(alice, 'rematch_declined');
        await sleep(30);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([['rematch_declined']]);
        expect(bobGot).toEqual([]);
        expect(redis._strings.has('pending:rematch:alice:bob')).toBe(false);
    });

    test('rematch_decline without a pending request notifies nobody [S4]', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const got = record(alice, 'rematch_declined');
        expect(await emitAck(bob, 'rematch_decline', { from_user_id: 'alice' })).toEqual(NO_PENDING);
        await sleep(50);
        expect(got).toEqual([]);
    });
});

describe('challenges', () => {
    /** alice challenges bob (with `terms`) and bob has received the banner. */
    async function challenged(terms = { time_control: '10', is_rated: true, color: 'white' }) {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const banner = once(bob, 'challenge_request');
        alice.emit('challenge_request', { to_user_id: 'bob', from_username: 'Alice', ...terms });
        await banner;
        await sleep(20); // let the notification insert finish
        supabase.calls.length = 0;
        return { alice, bob };
    }

    test('every challenge event is acknowledged: ok, or the reason it was refused [ACKS]', async () => {
        const alice = await ctx.connect('alice');
        const bob = await ctx.connect('bob');
        const request = { to_user_id: 'bob', from_username: 'Alice', time_control: '10', is_rated: true, color: 'white' };
        expect(await emitAck(alice, 'challenge_request', request)).toEqual({ ok: true });
        expect(await emitAck(alice, 'challenge_request', { ...request, to_user_id: 'alice' })).toEqual({
            ok: false,
            error: 'invalid_target',
        });
        expect(await emitAck(alice, 'challenge_request', { to_user_id: 42 })).toEqual({ ok: false, error: 'invalid_payload' });
        expect(await emitAck(bob, 'challenge_decline', { from_user_id: 'alice', by_username: 'Bob' })).toEqual({ ok: true });
        expect(await emitAck(bob, 'challenge_decline', { from_user_id: 'alice', by_username: 'Bob' })).toEqual(NO_PENDING);
        expect(await emitAck(bob, 'challenge_accept', { from_user_id: 'alice' })).toEqual(NO_PENDING);
    });

    test('challenge_request forwards the payload, stores the request and inserts a notification', async () => {
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
        expect(JSON.parse(redis._strings.get('pending:challenge:alice:bob'))).toEqual({
            time_control: '3+2',
            is_rated: true,
            color: 'black',
        });
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
        // [challenger's colour, Math.random, white, black]
        ['white', 0.1, 'alice', 'bob'],
        ['black', 0.9, 'bob', 'alice'],
        ['random', 0.9, 'alice', 'bob'],
        ['random', 0.5, 'bob', 'alice'],
        [undefined, 0.9, 'alice', 'bob'], // no colour → random (was: challenger always black)
    ])('challenge_accept: stored colour %p (random=%p) → white %p, black %p', async (color, random, whiteId, blackId) => {
        const { alice, bob } = await challenged({ time_control: '10', is_rated: true, color });
        queuePrivateGameFlow('ch-1');
        jest.spyOn(Math, 'random').mockReturnValue(random);
        const toAlice = once(alice, 'challenge_ready');
        const toBob = once(bob, 'challenge_ready');
        // The colour, terms and ids the accepter sends are ignored [S4].
        bob.emit('challenge_accept', { from_user_id: 'alice', to_user_id: 'mallory', time_control: '1', is_rated: false, color: 'black' });
        expect(await toAlice).toEqual({ game_id: 'ch-1' });
        expect(await toBob).toEqual({ game_id: 'ch-1' });
        // The host is always created as white, then the other player joins as black.
        expectPrivateGameOps({ gameId: 'ch-1', host: whiteId, hostColor: 'white', joiner: blackId, timeControl: '10', isRated: true });
        expect(await getGame('ch-1')).toMatchObject({ whiteId, blackId, isRated: true, timeControl: '10+0' });
    });

    test('challenge_accept without a pending challenge creates no game [S4]', async () => {
        const alice = await ctx.connect('alice');
        const got = record(alice, 'challenge_ready');
        const mallory = await ctx.connect('mallory');
        expect(
            await emitAck(mallory, 'challenge_accept', { from_user_id: 'alice', time_control: '1', is_rated: true, color: 'black' }),
        ).toEqual(NO_PENDING);
        await sleep(50);
        expect(got).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });

    test('challenge_accept DB failure → nothing emitted', async () => {
        const { alice, bob } = await challenged();
        const got = record(alice, 'challenge_ready');
        supabase.queue('games', { data: null, error: { message: 'boom' } });
        expect(await emitAck(bob, 'challenge_accept', { from_user_id: 'alice' })).toEqual({ ok: false, error: 'internal_error' });
        await sleep(50);
        expect(got).toEqual([]);
    });

    test('challenge_decline sends { by: by_username } to the challenger and clears the request', async () => {
        const { alice, bob } = await challenged();
        const p = once(alice, 'challenge_declined');
        bob.emit('challenge_decline', { from_user_id: 'alice', to_user_id: 'bob', by_username: 'Bob' });
        expect(await p).toEqual({ by: 'Bob' });
        expect(redis._strings.has('pending:challenge:alice:bob')).toBe(false);
    });

    test('challenge_decline without a pending challenge notifies nobody [S4]', async () => {
        const alice = await ctx.connect('alice');
        const mallory = await ctx.connect('mallory');
        const got = record(alice, 'challenge_declined');
        expect(await emitAck(mallory, 'challenge_decline', { from_user_id: 'alice', by_username: 'Bob' })).toEqual(NO_PENDING);
        await sleep(50);
        expect(got).toEqual([]);
    });

    test('the sender of a challenge is the verified user, never the payload id [S2]', async () => {
        const bob = await ctx.connect('bob');
        const mallory = await ctx.connect('mallory');
        const p = once(bob, 'challenge_request');
        mallory.emit('challenge_request', { from_user_id: 'impersonated', to_user_id: 'bob' });
        expect(await p).toEqual({ from_user_id: 'mallory', to_user_id: 'bob' });
        await sleep(30);
        expect(supabase.op(supabase.callsFor('notifications')[0], 'insert')[0].payload.from_user_id).toBe('mallory');
        expect(redis._strings.has('pending:challenge:mallory:bob')).toBe(true);
        expect(redis._strings.has('pending:challenge:impersonated:bob')).toBe(false);
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
