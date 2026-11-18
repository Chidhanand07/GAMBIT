/**
 * Draw offers through the real server: draw_offer / draw_accept / draw_decline, their
 * broadcasts and acks [DRAW-OFFER] (design/DRAW-OFFER-PROPOSAL.md, ADR F-151).
 */
jest.mock('../../supabase', () => ({
    supabase: require('../helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn() }));

const { supabase } = require('../../supabase');
const rating = require('../../services/rating');
const { getGame } = require('../../lib/gameStore');
const { useServer, once, record, sleep, waitFor } = require('./harness');

const ctx = useServer();
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

/** Both sides have moved (1. e4 e5): offers are allowed. */
const PLAYED = [
    { move: 'e2e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', san: 'e4' },
    { move: 'e7e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', san: 'e5' },
];
const seated = () => ctx.seatedGame({ fen: PLAYED[1].fen, moveLog: PLAYED, lastMoveAt: Date.now() });

beforeEach(() => {
    rating.processGameEnd.mockReset();
    rating.processGameEnd.mockResolvedValue(null);
    const answer = (call) =>
        supabase.op(call, 'update')?.[0]?.status ? { data: { id: 'x' }, error: null } : { data: null, error: null };
    supabase.queue('games', answer, answer, answer, answer);
});

test('offer → both players see draw_offered; accept → one game_end "Draw" by Agreement, rated once', async () => {
    const { game, white, black } = await seated();
    const offered = [once(white, 'draw_offered'), once(black, 'draw_offered')];
    expect(await emitAck(white, 'draw_offer', { game_id: game.id })).toEqual({ ok: true });
    for (const payload of await Promise.all(offered))
        expect(payload).toEqual({ game_id: game.id, by: 'white', ply: 2 });

    const ends = record(black, 'game_end');
    const ended = once(white, 'game_end');
    expect(await emitAck(black, 'draw_accept', { game_id: game.id })).toEqual({ ok: true });
    expect(await ended).toEqual({
        game_id: game.id,
        result: 'Draw',
        reason: 'Agreement',
        white_id: 'white-user',
        black_id: 'black-user',
    });
    await waitFor(() => rating.processGameEnd.mock.calls.length === 1, 500, 'rating');
    await sleep(50);
    expect(ends).toHaveLength(1);
    expect(await getGame(game.id)).toMatchObject({ status: 'completed', result: 'draw', reason: 'Agreement' });
    expect(await emitAck(black, 'draw_accept', { game_id: game.id })).toEqual({ ok: false, error: 'game_not_active' });
});

test('decline → draw_declined to the room; the game goes on', async () => {
    const { game, white, black } = await seated();
    await emitAck(white, 'draw_offer', { game_id: game.id });
    const declined = once(white, 'draw_declined');
    expect(await emitAck(black, 'draw_decline', { game_id: game.id })).toEqual({ ok: true });
    expect(await declined).toEqual({ game_id: game.id, by: 'black' });
    expect((await getGame(game.id)).drawOffer).toBeNull();
    expect(await emitAck(black, 'draw_decline', { game_id: game.id })).toEqual({
        ok: false,
        error: 'no_pending_request',
    });
});

test('acks for refusals and invalid payloads', async () => {
    const { game, white, black } = await seated();
    expect(await emitAck(white, 'draw_accept', { game_id: game.id })).toEqual({
        ok: false,
        error: 'no_pending_request',
    });
    await emitAck(white, 'draw_offer', { game_id: game.id });
    expect(await emitAck(black, 'draw_offer', { game_id: game.id })).toEqual({
        ok: false,
        error: 'draw_offer_pending',
    });
    expect(await emitAck(white, 'draw_offer', { game: game.id })).toEqual({ ok: false, error: 'invalid_payload' });
    const stranger = await ctx.connect('stranger');
    expect(await emitAck(stranger, 'draw_accept', { game_id: game.id })).toEqual({ ok: false, error: 'not_a_player' });
});

test('a reconnecting player sees the standing offer in game_state_sync', async () => {
    const { game, white } = await seated();
    await emitAck(white, 'draw_offer', { game_id: game.id });
    const again = await ctx.connect('black-user');
    again.emit('join_game', game.id);
    expect(await once(again, 'game_state_sync')).toMatchObject({
        drawOffer: { by: 'white' },
        lastDrawOfferPly: { white: 2 },
    });
});
