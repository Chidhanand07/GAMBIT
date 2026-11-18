/**
 * Draw offers through the game service: draw_offer / draw_accept / draw_decline [DRAW-OFFER]
 * (design/DRAW-OFFER-PROPOSAL.md, ADR F-151).
 */
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeClient, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const T = 5_000_000;
const W = 'white-user';
const B = 'black-user';
const G = { game_id: 'g' };

function setup(games = {}) {
    const gameStore = fakeGameStore(games);
    const emitter = fakeEmitter();
    const sessions = createSessionRegistry();
    const gamesRepo = {
        findForRestore: jest.fn(() => result(null)),
        updateById: jest.fn(() => result()),
        updateIfActive: jest.fn(() => result()),
        finishIfActive: jest.fn(() => result({ id: 'g' })),
    };
    const movesRepo = { insert: jest.fn(() => result()) };
    const ratingService = { processGameEnd: jest.fn(async () => null) };
    const reviewService = { triggerGameReview: jest.fn() };
    const deps = { gameStore, gamesRepo, movesRepo, ratingService, reviewService, sessions, emitter };
    const svc = createGameService({ ...deps, now: () => T });
    return { svc, ...deps };
}

/** 1. f3 e5: both sides have moved, White to move. */
async function afterTwoMoves(ctx) {
    await ctx.svc.makeMove({ game_id: 'g', from: 'f2', to: 'f3' }, W, fakeClient());
    await ctx.svc.makeMove({ game_id: 'g', from: 'e7', to: 'e5' }, B, fakeClient());
}

async function playedGame(extra = {}) {
    const ctx = setup({ g: makeGame({ id: 'g', lastMoveAt: T, startedAt: T, ...extra }) });
    await afterTwoMoves(ctx);
    ctx.emitter.sent.length = 0;
    return ctx;
}

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('draw_offer', () => {
    test('stores the offer in the game state and tells the room who offered', async () => {
        const ctx = await playedGame();
        expect(await ctx.svc.offerDraw(G, B)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g')).toMatchObject({
            drawOffer: { by: 'black', at: T, ply: 2 },
            lastDrawOfferPly: { black: 2 },
        });
        expect(ctx.emitter.sent).toEqual([
            { room: 'game_g', event: 'draw_offered', args: [{ game_id: 'g', by: 'black', ply: 2 }] },
        ]);
    });

    test.each([
        ['an unknown game', 'nope', W, 'game_not_found'],
        ['a spectator', 'g', 'stranger', 'not_a_player'],
    ])('%s: refused', async (_n, gameId, userId, error) => {
        const ctx = await playedGame();
        expect(await ctx.svc.offerDraw({ game_id: gameId }, userId)).toEqual({ ok: false, error });
        expect(ctx.gameStore.state.get('g').drawOffer).toBeUndefined();
        expect(ctx.emitter.sent).toEqual([]);
    });

    test('a finished game: game_not_active', async () => {
        const ctx = await playedGame();
        await ctx.svc.resign(G, W);
        expect(await ctx.svc.offerDraw(G, B)).toEqual({ ok: false, error: 'game_not_active' });
    });

    test('before both sides have moved: draw_offer_too_soon', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        expect(await ctx.svc.offerDraw(G, W)).toEqual({ ok: false, error: 'draw_offer_too_soon' });
        await ctx.svc.makeMove({ game_id: 'g', from: 'e2', to: 'e4' }, W, fakeClient());
        expect(await ctx.svc.offerDraw(G, B)).toEqual({ ok: false, error: 'draw_offer_too_soon' });
    });

    test('a second offer while one stands: draw_offer_pending (either side)', async () => {
        const ctx = await playedGame();
        await ctx.svc.offerDraw(G, W);
        expect(await ctx.svc.offerDraw(G, W)).toEqual({ ok: false, error: 'draw_offer_pending' });
        expect(await ctx.svc.offerDraw(G, B)).toEqual({ ok: false, error: 'draw_offer_pending' });
    });

    test('after a declined offer, the same side waits two of its own moves', async () => {
        const ctx = await playedGame();
        await ctx.svc.offerDraw(G, W);
        await ctx.svc.declineDraw(G, B);
        expect(await ctx.svc.offerDraw(G, W)).toEqual({ ok: false, error: 'draw_offer_too_soon' });
        await ctx.svc.makeMove({ game_id: 'g', from: 'a2', to: 'a3' }, W, fakeClient());
        await ctx.svc.makeMove({ game_id: 'g', from: 'a7', to: 'a6' }, B, fakeClient());
        expect(await ctx.svc.offerDraw(G, W)).toEqual({ ok: false, error: 'draw_offer_too_soon' });
        await ctx.svc.makeMove({ game_id: 'g', from: 'b2', to: 'b3' }, W, fakeClient());
        expect(await ctx.svc.offerDraw(G, W)).toEqual({ ok: true });
    });
});

describe('draw_accept', () => {
    test('ends the game as a draw by agreement through the finalizer: one game_end, rated once', async () => {
        const ctx = await playedGame();
        await ctx.svc.offerDraw(G, W);
        expect(await ctx.svc.acceptDraw(G, B)).toEqual({ ok: true });
        await flush();
        expect(ctx.emitter.named('game_end')).toEqual([
            {
                room: 'game_g',
                event: 'game_end',
                args: [{ game_id: 'g', result: 'Draw', reason: 'Agreement', white_id: W, black_id: B }],
            },
        ]);
        const stored = ctx.gameStore.state.get('g');
        expect(stored).toMatchObject({ status: 'completed', result: 'draw', reason: 'Agreement', drawOffer: null });
        expect(ctx.gamesRepo.finishIfActive).toHaveBeenCalledWith('g', expect.objectContaining({ result: 'draw' }));
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledWith('g', W, B, 'draw', '10', true);
    });

    test.each([
        ['no offer stands', null, B, 'no_pending_request'],
        ['the offer is your own', W, W, 'no_pending_request'],
        ['a spectator', W, 'stranger', 'not_a_player'],
    ])('%s: refused, the game goes on', async (_n, offerer, accepter, error) => {
        const ctx = await playedGame();
        if (offerer) await ctx.svc.offerDraw(G, offerer);
        expect(await ctx.svc.acceptDraw(G, accepter)).toEqual({ ok: false, error });
        expect(ctx.gameStore.state.get('g').status).toBe('active');
        expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
    });

    test('a mate that commits first wins the race: the accept is refused, one ending, rated once', async () => {
        // 1. f3 e5 2. g4 … Black offers, then mates before White's accept arrives.
        const ctx = await playedGame();
        await ctx.svc.makeMove({ game_id: 'g', from: 'g2', to: 'g4' }, W, fakeClient());
        await ctx.svc.offerDraw(G, B);
        await ctx.svc.makeMove({ game_id: 'g', from: 'd8', to: 'h4' }, B, fakeClient());
        expect(await ctx.svc.acceptDraw(G, W)).toEqual({ ok: false, error: 'game_not_active' });
        await flush();
        expect(ctx.emitter.named('game_end').map((e) => e.args[0].reason)).toEqual(['Checkmate']);
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
    });

    test('an accepted draw that commits first wins: the mating move is refused', async () => {
        const ctx = await playedGame();
        await ctx.svc.makeMove({ game_id: 'g', from: 'g2', to: 'g4' }, W, fakeClient());
        await ctx.svc.offerDraw(G, W);
        expect(await ctx.svc.acceptDraw(G, B)).toEqual({ ok: true });
        const client = fakeClient();
        expect(await ctx.svc.makeMove({ game_id: 'g', from: 'd8', to: 'h4' }, B, client)).toEqual({
            ok: false,
            error: 'game_not_active',
        });
        expect(ctx.emitter.named('game_end').map((e) => e.args[0].reason)).toEqual(['Agreement']);
    });

    test('a move clears the offer: accepting it afterwards finds nothing', async () => {
        const ctx = await playedGame();
        await ctx.svc.offerDraw(G, B); // White to move: White's move is the implicit decline
        await ctx.svc.makeMove({ game_id: 'g', from: 'a2', to: 'a3' }, W, fakeClient());
        expect(ctx.gameStore.state.get('g').drawOffer).toBeNull();
        expect(await ctx.svc.acceptDraw(G, W)).toEqual({ ok: false, error: 'no_pending_request' });
    });
});

describe('draw_decline', () => {
    test('clears the offer and tells the room who declined', async () => {
        const ctx = await playedGame();
        await ctx.svc.offerDraw(G, W);
        ctx.emitter.sent.length = 0;
        expect(await ctx.svc.declineDraw(G, B)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').drawOffer).toBeNull();
        expect(ctx.emitter.sent).toEqual([
            { room: 'game_g', event: 'draw_declined', args: [{ game_id: 'g', by: 'black' }] },
        ]);
    });

    test.each([
        ['no offer stands', { offerer: null, decliner: B, error: 'no_pending_request' }],
        ['your own offer', { offerer: W, decliner: W, error: 'no_pending_request' }],
        ['a spectator', { offerer: W, decliner: 'stranger', error: 'not_a_player' }],
        ['an unknown game', { offerer: W, decliner: B, error: 'game_not_found', gameId: 'nope' }],
    ])('%s: refused', async (_n, { offerer, decliner, error, gameId = 'g' }) => {
        const ctx = await playedGame();
        if (offerer) await ctx.svc.offerDraw(G, offerer);
        expect(await ctx.svc.declineDraw({ game_id: gameId }, decliner)).toEqual({ ok: false, error });
        expect(ctx.emitter.named('draw_declined')).toEqual([]);
    });
});

describe('reconnect', () => {
    test('game_state_sync carries the standing offer and each side’s last offer', async () => {
        const ctx = await playedGame();
        await ctx.svc.offerDraw(G, W);
        const client = fakeClient('s9');
        await ctx.svc.joinGame('g', client, B);
        expect(client.emitted[0].event).toBe('game_state_sync');
        expect(client.emitted[0].args[0]).toMatchObject({ drawOffer: { by: 'white' }, lastDrawOfferPly: { white: 2 } });
    });

    test('without an offer the sync has no draw keys (older clients see the same payload)', async () => {
        const ctx = await playedGame();
        const client = fakeClient('s9');
        await ctx.svc.joinGame('g', client, B);
        expect(client.emitted[0].args[0]).not.toHaveProperty('drawOffer');
        expect(client.emitted[0].args[0]).not.toHaveProperty('lastDrawOfferPly');
    });
});
