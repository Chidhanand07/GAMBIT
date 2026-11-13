/**
 * Characterization: in-game chat (send_message → chat_message + messages insert).
 * The frontend sends `{ game_id, from, text }`; the server persists `data.message`.
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { supabase } = require('../../supabase');
const { getGame, setGame } = require('../../lib/gameStore');
const { useServer, once, record, sleep, opsFor, ISO_DATE } = require('./harness');

const ctx = useServer();

describe('send_message', () => {
    test('frontend shape { text } → broadcast as-is with from_user_id, persisted with content undefined (BUG pinned)', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const toBlack = once(black, 'chat_message');
        const toWhite = once(white, 'chat_message');
        white.emit('send_message', { game_id: game.id, from: 'whitey', text: 'gl hf' });

        const expected = { game_id: game.id, from: 'whitey', text: 'gl hf', from_user_id: 'white-user' };
        expect(await toBlack).toEqual(expected);
        expect(await toWhite).toEqual(expected);

        await sleep(20);
        expect(opsFor('messages')).toEqual([
            [['insert', { game_id: game.id, user_id: 'white-user', content: undefined, created_at: ISO_DATE }]],
        ]);
        // Supabase serialises the undefined content as a missing column → NULL in the DB.
        const insert = supabase.op(supabase.callsFor('messages')[0], 'insert')[0];
        expect(insert.content).toBeUndefined();
    });

    test('{ message } is what gets persisted; a spoofed from_user_id is overridden', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const p = once(white, 'chat_message');
        black.emit('send_message', { game_id: game.id, message: 'hi', from_user_id: 'spoofed' });
        expect(await p).toEqual({ game_id: game.id, message: 'hi', from_user_id: 'black-user' });
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
        white.emit('send_message', { game_id: game.id, message: 'x' });
        expect(await p).toMatchObject({ message: 'x' });
    });

    test('chat still works after the game is completed (status is not checked)', async () => {
        const { game, white, black } = await ctx.seatedGame();
        await setGame(game.id, { ...(await getGame(game.id)), status: 'completed' });
        const p = once(black, 'chat_message');
        white.emit('send_message', { game_id: game.id, message: 'gg' });
        expect(await p).toEqual({ game_id: game.id, message: 'gg', from_user_id: 'white-user' });
    });

    test('spectators in the room receive chat but cannot send it', async () => {
        const { game, white, black } = await ctx.seatedGame();
        const spectator = await ctx.connect('watcher');
        spectator.emit('spectate_game', game.id);
        await sleep(50);
        const heard = once(spectator, 'chat_message');
        white.emit('send_message', { game_id: game.id, message: 'hello room' });
        expect(await heard).toMatchObject({ from_user_id: 'white-user' });

        const blackGot = record(black, 'chat_message');
        spectator.emit('send_message', { game_id: game.id, message: 'from the crowd' });
        await sleep(80);
        expect(blackGot).toEqual([]);
        expect(opsFor('messages')).toHaveLength(1);
    });

    test('a non-participant, a missing game_id, or a game not in Redis → ignored, nothing persisted', async () => {
        const { game, black } = await ctx.seatedGame();
        const outsider = await ctx.connect();
        const got = record(black, 'chat_message');
        outsider.emit('send_message', { game_id: game.id, message: 'outsider' });
        black.emit('send_message', { message: 'no game id' });
        black.emit('send_message', { game_id: 'not-in-redis', message: 'lost' });
        await sleep(100);
        expect(got).toEqual([]);
        expect(supabase.calls).toEqual([]);
    });
});
