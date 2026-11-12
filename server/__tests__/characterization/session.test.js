/**
 * Socket identity and reconnect-during-game.
 *
 * Updated for S2 (NODE-10): identity comes from the handshake token, verified
 * by Supabase Auth; the `authenticate` event no longer exists. The reconnect
 * cases below are the original characterization, now triggered by connecting
 * with the player's token instead of emitting `authenticate`.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const { getGame, setGame } = require('../../lib/gameStore');
const { useServer, once, record, recordAll, sleep, makeGame, tokenFor } = require('./harness');

const ctx = useServer();

describe('handshake identity [S2]', () => {
    test.each([
        ['no auth at all', undefined],
        ['an empty auth object', {}],
        ['a user id instead of a token', { userId: 'white-user' }],
        ['a token Supabase Auth does not recognise', { token: 'forged.jwt.value' }],
        ['a non-string token', { token: 42 }],
    ])('%s is refused with "unauthorized"', async (_name, auth) => {
        const s = ctx.open(auth);
        const err = await once(s, 'connect_error');
        expect(err.message).toBe('unauthorized');
        expect(s.connected).toBe(false);
    });

    test('fails closed when Supabase Auth is unreachable', async () => {
        supabase.auth.getUser.mockRejectedValue(new Error('network down'));
        const s = ctx.open({ token: tokenFor('white-user') });
        expect((await once(s, 'connect_error')).message).toBe('unauthorized');
    });

    test('the token is verified with Supabase Auth exactly once per connection', async () => {
        await ctx.connect('quiet-user');
        expect(supabase.auth.getUser.mock.calls).toEqual([[tokenFor('quiet-user')]]);
        expect(supabase.calls).toEqual([]);
    });

    test('the `authenticate` event is gone: claiming another id changes nothing', async () => {
        const victim = await ctx.connect('victim');
        const mallory = await ctx.connect('mallory');
        const echoed = record(mallory, 'authenticated');
        const leaked = record(mallory, 'challenge_request');
        mallory.emit('authenticate', 'victim');
        await sleep(50);
        // Still not in user_victim: an event addressed to the victim does not reach mallory.
        const p = once(victim, 'challenge_request');
        const other = await ctx.connect('other');
        other.emit('challenge_request', { to_user_id: 'victim' });
        await p;
        await sleep(30);
        expect(echoed).toEqual([]);
        expect(leaked).toEqual([]);
    });

    test('a connection joins its own user_<id> room automatically', async () => {
        const target = await ctx.connect('room-user');
        const other = await ctx.connect();
        const p = once(target, 'challenge_request');
        other.emit('challenge_request', { to_user_id: 'room-user' });
        expect(await p).toMatchObject({ to_user_id: 'room-user' });
    });

    test('a user with no active game receives nothing on connect', async () => {
        const events = [];
        await ctx.connect('idle-user', (s) => s.onAny((event, ...args) => events.push([event, ...args])));
        await sleep(80);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([]);
    });
});

describe('reconnect during an active game', () => {
    /** Seat both players, then drop white so the server records disconnectInfo. */
    async function whiteDropsOut(overrides = {}) {
        const { game, white, black } = await ctx.seatedGame({ whiteClockMs: 600000, blackClockMs: 590000, ...overrides });
        const gone = once(black, 'opponent_disconnected');
        white.disconnect();
        await gone;
        return { game, black };
    }

    test('clears disconnectInfo, rejoins the room, and emits opponent_reconnected + clock_sync', async () => {
        const { game, black } = await whiteDropsOut();
        const before = await getGame(game.id);
        expect(before.disconnectInfo).toEqual({ userId: 'white-user', side: 'white', at: expect.any(Number) });

        const back = once(black, 'opponent_reconnected');
        let events;
        let sync;
        const again = await ctx.connect('white-user', (s) => {
            events = recordAll(s);
            sync = once(s, 'clock_sync');
        });

        expect(await back).toEqual({ userId: 'white-user' });
        expect(await sync).toEqual({ whiteMs: 600000, blackMs: 590000 });
        // The reconnecting socket is put in the room first, so it also hears opponent_reconnected.
        expect(events).toEqual([
            ['opponent_reconnected', { userId: 'white-user' }],
            ['clock_sync', { whiteMs: 600000, blackMs: 590000 }],
        ]);

        // No move had been made (lastMoveAt null): reconnecting must not start a clock [G8].
        expect(await getGame(game.id)).toEqual({
            ...before,
            disconnectInfo: null,
            lastMoveAt: null,
        });

        // Back in the game room: room broadcasts reach the new socket.
        const chat = once(again, 'chat_message');
        black.emit('send_message', { game_id: game.id, text: 'wb' });
        expect(await chat).toEqual({ game_id: game.id, text: 'wb', from_user_id: 'black-user' });
    });

    test('clock_sync sends the Redis clocks as stored, without deducting time', async () => {
        const { game } = await whiteDropsOut({ lastMoveAt: null, whiteClockMs: 123456, blackClockMs: 654321 });
        let sync;
        await ctx.connect('white-user', (s) => {
            sync = once(s, 'clock_sync');
        });
        expect(await sync).toEqual({ whiteMs: 123456, blackMs: 654321 });
        expect((await getGame(game.id)).whiteClockMs).toBe(123456);
    });

    test('nothing happens when the disconnectInfo belongs to the other player', async () => {
        const { game } = await whiteDropsOut();
        let events;
        await ctx.connect('black-user', (s) => {
            events = recordAll(s);
        });
        await sleep(80);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([]);
        expect((await getGame(game.id)).disconnectInfo).toEqual(expect.objectContaining({ userId: 'white-user' }));
    });

    test('nothing happens when the game is no longer active', async () => {
        const { game } = await whiteDropsOut();
        await setGame(game.id, { ...(await getGame(game.id)), status: 'completed' });
        let events;
        await ctx.connect('white-user', (s) => {
            events = recordAll(s);
        });
        await sleep(80);
        expect(events.filter(([e]) => e !== 'queue_status')).toEqual([]);
    });

    test('reconnect without a recorded disconnect does not emit clock_sync or rejoin the room', async () => {
        const game = makeGame({ id: 'never-dropped' });
        await setGame(game.id, game);
        const first = await ctx.connect('white-user');
        first.emit('join_game', game.id);
        await once(first, 'game_state_sync');

        let syncs;
        let reconnects;
        await ctx.connect('white-user', (s) => {
            syncs = record(s, 'clock_sync');
            reconnects = record(s, 'opponent_reconnected');
        });
        await sleep(80);
        expect(syncs).toEqual([]);
        expect(reconnects).toEqual([]);
    });
});
