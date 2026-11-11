/**
 * Characterization: socket `authenticate` and reconnect-during-game.
 * Pins current behaviour, including the known bug that the client-supplied
 * userId is trusted without any token check.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const { getGame, setGame } = require('../../lib/gameStore');
const { useServer, once, record, recordAll, sleep, makeGame } = require('./harness');

const ctx = useServer();

describe('authenticate', () => {
    test('echoes whatever userId the client claims (BUG pinned: identity is not verified)', async () => {
        const s = await ctx.connect();
        s.emit('authenticate', 'someone-elses-id');
        expect(await once(s, 'authenticated')).toEqual({ userId: 'someone-elses-id' });
    });

    test('non-string ids are rejected by the payload schema [S15]', async () => {
        const s = await ctx.connect();
        const echoed = record(s, 'authenticated');
        const ack = await new Promise((resolve) => s.emit('authenticate', 42, resolve));
        expect(ack).toEqual({ ok: false, error: 'invalid_payload' });
        expect(echoed).toEqual([]);
    });

    test('joins the user_<id> room so user-addressed events reach the socket', async () => {
        const target = await ctx.connect('room-user');
        const other = await ctx.connect();
        const p = once(target, 'rematch_declined');
        other.emit('rematch_decline', { to_user_id: 'room-user' });
        expect(await p).toBeUndefined();
    });

    test('authenticate makes no database calls', async () => {
        await ctx.connect('quiet-user');
        expect(supabase.calls).toEqual([]);
    });

    test('a user with no active game only receives `authenticated`', async () => {
        const s = await ctx.connect();
        const events = recordAll(s);
        s.emit('authenticate', 'idle-user');
        await once(s, 'authenticated');
        await sleep(80);
        expect(events).toEqual([['authenticated', { userId: 'idle-user' }]]);
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
        const again = await ctx.connect();
        const events = recordAll(again);
        const sync = once(again, 'clock_sync');
        again.emit('authenticate', 'white-user');

        expect(await back).toEqual({ userId: 'white-user' });
        expect(await sync).toEqual({ whiteMs: 600000, blackMs: 590000 });
        // The reconnecting socket is put in the room first, so it also hears opponent_reconnected.
        expect(events).toEqual([
            ['authenticated', { userId: 'white-user' }],
            ['opponent_reconnected', { userId: 'white-user' }],
            ['clock_sync', { whiteMs: 600000, blackMs: 590000 }],
        ]);

        // NOTE pinned: lastMoveAt is reset to "now" even though no move was ever
        // made (it was null), which starts white's clock before the first move.
        expect(await getGame(game.id)).toEqual({
            ...before,
            disconnectInfo: null,
            lastMoveAt: expect.any(Number),
        });

        // Back in the game room: room broadcasts reach the new socket.
        const chat = once(again, 'chat_message');
        black.emit('send_message', { game_id: game.id, text: 'wb' });
        expect(await chat).toEqual({ game_id: game.id, text: 'wb', from_user_id: 'black-user' });
    });

    test('clock_sync sends the Redis clocks as stored, without deducting time', async () => {
        const { game } = await whiteDropsOut({ lastMoveAt: null, whiteClockMs: 123456, blackClockMs: 654321 });
        const again = await ctx.connect();
        const sync = once(again, 'clock_sync');
        again.emit('authenticate', 'white-user');
        expect(await sync).toEqual({ whiteMs: 123456, blackMs: 654321 });
        expect((await getGame(game.id)).whiteClockMs).toBe(123456);
    });

    test('nothing happens when the disconnectInfo belongs to the other player', async () => {
        const { game } = await whiteDropsOut();
        const again = await ctx.connect();
        const events = recordAll(again);
        again.emit('authenticate', 'black-user');
        await once(again, 'authenticated');
        await sleep(80);
        expect(events).toEqual([['authenticated', { userId: 'black-user' }]]);
        expect((await getGame(game.id)).disconnectInfo).toEqual(expect.objectContaining({ userId: 'white-user' }));
    });

    test('nothing happens when the game is no longer active', async () => {
        const { game } = await whiteDropsOut();
        await setGame(game.id, { ...(await getGame(game.id)), status: 'completed' });
        const again = await ctx.connect();
        const events = recordAll(again);
        again.emit('authenticate', 'white-user');
        await once(again, 'authenticated');
        await sleep(80);
        expect(events).toEqual([['authenticated', { userId: 'white-user' }]]);
    });

    test('reconnect without a recorded disconnect does not emit clock_sync or rejoin the room', async () => {
        const game = makeGame({ id: 'never-dropped' });
        await setGame(game.id, game);
        const first = await ctx.connect('white-user');
        first.emit('join_game', game.id);
        await once(first, 'game_state_sync');

        const second = await ctx.connect();
        const syncs = record(second, 'clock_sync');
        const reconnects = record(second, 'opponent_reconnected');
        second.emit('authenticate', 'white-user');
        await once(second, 'authenticated');
        await sleep(80);
        expect(syncs).toEqual([]);
        expect(reconnects).toEqual([]);
    });
});
