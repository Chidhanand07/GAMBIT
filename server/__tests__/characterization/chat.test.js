/**
 * Characterization: in-game chat (send_message → chat_message + messages insert).
 * The frontend sends `{ game_id, from, text }`; the server stores and relays that text [G6].
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const { getGame, setGame } = require('../../lib/gameStore');
const { useServer, once, record, sleep, opsFor, ISO_DATE } = require('./harness');

const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const ctx = useServer();

describe('send_message', () => {
    test('frontend shape { text } → broadcast with from_user_id and persisted as the message content [G6]', async () => {
        // Was: "persisted with content undefined (BUG pinned)" — the server read `message`.
        const { game, white, black } = await ctx.seatedGame();
        const toBlack = once(black, 'chat_message');
        const toWhite = once(white, 'chat_message');
        const ack = await emitAck(white, 'send_message', { game_id: game.id, from: 'whitey', text: 'gl hf' });

        const expected = { game_id: game.id, from: 'whitey', text: 'gl hf', from_user_id: 'white-user' };
        expect(ack).toEqual({ ok: true });
        expect(await toBlack).toEqual(expected);
        expect(await toWhite).toEqual(expected);

        await sleep(20);
        expect(opsFor('messages')).toEqual([
            [['insert', { game_id: game.id, user_id: 'white-user', content: 'gl hf', created_at: ISO_DATE }]],
        ]);
    });

    test('an older { message } payload is read as the text; a spoofed from_user_id is overridden', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const p = once(white, 'chat_message');
        black.emit('send_message', { game_id: game.id, message: 'hi', from_user_id: 'spoofed' });
        expect(await p).toEqual({ game_id: game.id, text: 'hi', from_user_id: 'black-user' });
        await sleep(20);
        expect(supabase.op(supabase.callsFor('messages')[0], 'insert')[0]).toEqual({
            game_id: game.id,
            user_id: 'black-user',
            content: 'hi',
            created_at: ISO_DATE,
        });
    });

    test('a DB insert error is only logged; the message is still broadcast', async () => {
        const { game, white, black } = await ctx.seatedGame();
        supabase.queue('messages', { data: null, error: { message: 'rls' } });
        const p = once(black, 'chat_message');
        white.emit('send_message', { game_id: game.id, text: 'x' });
        expect(await p).toMatchObject({ text: 'x' });
    });

    test('chat is closed once the game is over: refused with a reason, nothing relayed or stored [G6]', async () => {
        // Was: "chat still works after the game is completed (status is not checked)".
        const { game, white, black } = await ctx.seatedGame();
        await setGame(game.id, { ...(await getGame(game.id)), status: 'completed' });
        const got = record(black, 'chat_message');
        expect(await emitAck(white, 'send_message', { game_id: game.id, text: 'gg' })).toEqual({
            ok: false,
            error: 'game_not_active',
        });
        await sleep(50);
        expect(got).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });

    test.each([
        ['an empty message', { text: '   ' }],
        ['a message over 500 characters', { text: 'x'.repeat(501) }],
        ['no text at all', {}],
    ])('%s → invalid_payload; nothing relayed or stored [G6]', async (_label, fields) => {
        const { game, white, black } = await ctx.seatedGame();
        const got = record(black, 'chat_message');
        expect(await emitAck(white, 'send_message', { game_id: game.id, ...fields })).toEqual({
            ok: false,
            error: 'invalid_payload',
        });
        await sleep(50);
        expect(got).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });

    test('spectators in the room receive chat but cannot send it', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const spectator = await ctx.connect('watcher');
        spectator.emit('spectate_game', game.id);
        await sleep(50);
        const heard = once(spectator, 'chat_message');
        white.emit('send_message', { game_id: game.id, text: 'hello room' });
        expect(await heard).toMatchObject({ from_user_id: 'white-user' });

        const blackGot = record(black, 'chat_message');
        expect(await emitAck(spectator, 'send_message', { game_id: game.id, text: 'from the crowd' })).toEqual({
            ok: false,
            error: 'not_a_player',
        });
        await sleep(50);
        expect(blackGot).toEqual([]);
        expect(opsFor('messages')).toHaveLength(1);
    });

    test('a non-participant, a missing game_id, or a game not in Redis → refused, nothing persisted', async () => {
        const { game, black } = await ctx.seatedGame();
        const outsider = await ctx.connect();
        const got = record(black, 'chat_message');
        expect(await emitAck(outsider, 'send_message', { game_id: game.id, text: 'outsider' })).toMatchObject({ ok: false });
        expect(await emitAck(black, 'send_message', { text: 'no game id' })).toEqual({ ok: false, error: 'invalid_payload' });
        expect(await emitAck(black, 'send_message', { game_id: 'not-in-redis', text: 'lost' })).toEqual({
            ok: false,
            error: 'game_not_found',
        });
        await sleep(50);
        expect(got).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });
});

describe('rate limit on chat (per user and event) [RATE-LIMITS]', () => {
    test('the 6th message within 10 s is refused with rate_limited and a retry hint; nothing is relayed', async () => {
        const { game, white, black } = await ctx.seatedGame();
        // Late events of the previous test (same user ids) must not count against this one.
        const redis = require('../../lib/redis');
        for (const key of [...redis._strings.keys()]) if (key.startsWith('ratelimit:')) redis._strings.delete(key);
        const got = record(black, 'chat_message');
        for (let i = 0; i < 5; i++) {
            expect(await emitAck(white, 'send_message', { game_id: game.id, text: `m${i}` })).toEqual({ ok: true });
        }
        const ack = await emitAck(white, 'send_message', { game_id: game.id, text: 'spam' });
        expect(ack).toMatchObject({ ok: false, error: 'rate_limited' });
        expect(ack.retryAfterMs).toBeGreaterThan(0);
        await sleep(100);
        // The five allowed lines arrive (possibly after the acks); the refused one never does.
        expect(got.map((m) => m.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
        // The other player has their own budget.
        expect(await emitAck(black, 'send_message', { game_id: game.id, text: 'hi' })).toEqual({ ok: true });
    });
});
