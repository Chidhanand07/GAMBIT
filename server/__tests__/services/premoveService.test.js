/**
 * Premoves through the game service: premove_set / premove_cancel and the premove played
 * right after the opponent's move [PREMOVE] (ADR F-153).
 */
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeClient, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const T = 5_000_000;
const W = 'white-user';
const B = 'black-user';

function setup(games = {}, preferences = undefined) {
    const gameStore = fakeGameStore(games);
    const emitter = fakeEmitter();
    const sessions = createSessionRegistry();
    const gamesRepo = {
        findForRestore: jest.fn(() => result(null)),
        updateById: jest.fn(() => result()),
        updateIfActive: jest.fn(() => result()),
        finishIfActive: jest.fn(() => result({ id: 'g' })),
    };
    const movesRepo = { insert: jest.fn(() => result()), deleteAfter: jest.fn(() => result()) };
    const ratingService = { processGameEnd: jest.fn(async () => null) };
    const reviewService = { triggerGameReview: jest.fn() };
    const deps = { gameStore, gamesRepo, movesRepo, ratingService, reviewService, sessions, emitter, preferences };
    let now = T;
    const svc = createGameService({ ...deps, now: () => now });
    return { svc, ...deps, advance: (ms) => (now += ms) };
}

/** A 1+2 game where White has played 1. e4 at T; Black to move. */
async function afterE4(preferences = undefined) {
    const ctx = setup(
        {
            g: makeGame({ id: 'g', timeControl: '1+2', incrementMs: 2000, whiteClockMs: 60_000, blackClockMs: 60_000 }),
        },
        preferences,
    );
    await ctx.svc.makeMove({ game_id: 'g', from: 'e2', to: 'e4' }, W, fakeClient());
    ctx.emitter.sent.length = 0;
    return ctx;
}

const premove = (ctx, userId, from, to) => ctx.svc.setPremove({ game_id: 'g', from, to }, userId);
const move = (ctx, userId, from, to) => ctx.svc.makeMove({ game_id: 'g', from, to }, userId, fakeClient());
const sans = (ctx) => ctx.gameStore.state.get('g').moveLog.map((m) => m.san);

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// F-166: the stored "Premoves" switch is read on the server; a client cannot queue one with it off.
describe('the stored "Premoves" switch [F-166]', () => {
    const port = (byUser) => ({
        spectatingAllowed: jest.fn(async () => true),
        notify: jest.fn(async () => false),
        gameplayOf: jest.fn(
            async (ids) => new Map(ids.map((id) => [id, { premoves: false, allowTakebacks: false, ...byUser[id] }])),
        ),
    });

    test('off (the default): premoves_disabled, nothing stored', async () => {
        const prefs = port({});
        const ctx = await afterE4(prefs);
        expect(await premove(ctx, W, 'g1', 'f3')).toEqual({ ok: false, error: 'premoves_disabled' });
        expect(ctx.gameStore.state.get('g').premove ?? null).toBeNull();
        expect(prefs.gameplayOf).toHaveBeenCalledWith([W]);
    });

    test('on: queued as before', async () => {
        const ctx = await afterE4(port({ [W]: { premoves: true } }));
        expect(await premove(ctx, W, 'g1', 'f3')).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').premove).toEqual({ by: 'white', from: 'g1', to: 'f3' });
    });

    test("the opponent's switch does not count, only the caller's", async () => {
        const ctx = await afterE4(port({ [B]: { premoves: true } }));
        expect(await premove(ctx, W, 'g1', 'f3')).toEqual({ ok: false, error: 'premoves_disabled' });
    });
});

describe('premove_set / premove_cancel', () => {
    test('stored for the owner, never broadcast', async () => {
        const ctx = await afterE4();
        expect(await premove(ctx, W, 'g1', 'f3')).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').premove).toEqual({ by: 'white', from: 'g1', to: 'f3' });
        expect(ctx.emitter.sent).toEqual([]);
    });

    test.each([
        ['my own turn', { userId: B, from: 'e7', to: 'e5', error: 'premove_your_turn' }],
        ['not my piece', { userId: W, from: 'e7', to: 'e5', error: 'illegal_premove' }],
        ['a spectator', { userId: 'stranger', from: 'g1', to: 'f3', error: 'not_a_player' }],
    ])('%s: refused', async (_n, { userId, from, to, error }) => {
        const ctx = await afterE4();
        expect(await premove(ctx, userId, from, to)).toEqual({ ok: false, error });
        expect(ctx.gameStore.state.get('g').premove).toBeUndefined();
    });

    test('a finished game: game_not_active', async () => {
        const ctx = await afterE4();
        await ctx.svc.resign({ game_id: 'g' }, B);
        expect(await premove(ctx, W, 'g1', 'f3')).toEqual({ ok: false, error: 'game_not_active' });
    });

    test('cancel drops only my own premove; cancelling nothing is fine', async () => {
        const ctx = await afterE4();
        await premove(ctx, W, 'g1', 'f3');
        expect(await ctx.svc.cancelPremove({ game_id: 'g' }, B)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').premove).toEqual({ by: 'white', from: 'g1', to: 'f3' });
        expect(await ctx.svc.cancelPremove({ game_id: 'g' }, W)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').premove).toBeNull();
        expect(await ctx.svc.cancelPremove({ game_id: 'g' }, 'stranger')).toEqual({ ok: false, error: 'not_a_player' });
    });
});

describe('the premove is played right after the opponent’s move', () => {
    test('legal: two move_made in order, zero thinking time, the increment intact, two rows in order', async () => {
        const ctx = await afterE4();
        await premove(ctx, W, 'g1', 'f3');
        ctx.advance(7000); // Black thinks 7 s
        expect(await move(ctx, B, 'e7', 'e5')).toEqual({ ok: true });
        expect(sans(ctx)).toEqual(['e4', 'e5', 'Nf3']);
        const moves = ctx.emitter.named('move_made').map((e) => e.args[0]);
        expect(moves.map((m) => [m.san, m.from, m.to])).toEqual([
            ['e5', 'e7', 'e5'],
            ['Nf3', 'g1', 'f3'],
        ]);
        // No clock runs before the first move, so after e4 White has 60 + 2 s. Black used 7 s
        // (+2 s): 55 s. White's premove used no time and still got its increment: 64 s.
        expect(moves[0]).toMatchObject({ whiteMs: 62_000, blackMs: 55_000 });
        expect(moves[1]).toMatchObject({ whiteMs: 64_000, blackMs: 55_000 });
        expect(ctx.gameStore.state.get('g')).toMatchObject({
            whiteClockMs: 64_000,
            blackClockMs: 55_000,
            lastMoveAt: T + 7000,
            activeSide: 'b',
            premove: null,
        });
        await flush();
        await flush();
        expect(ctx.movesRepo.insert.mock.calls.map(([r]) => [r.move_number, r.san])).toEqual([
            [1, 'e4'],
            [2, 'e5'],
            [3, 'Nf3'],
        ]);
        expect(ctx.gamesRepo.updateById.mock.calls.at(-1)[1].fen).toBe(ctx.gameStore.state.get('g').fen);
    });

    test('illegal after the opponent’s move: dropped, only its owner is told', async () => {
        const ctx = await afterE4();
        // The pawn push onto e5 is blocked once Black plays …e5.
        await premove(ctx, W, 'e4', 'e5');
        expect(await move(ctx, B, 'e7', 'e5')).toEqual({ ok: true });
        expect(sans(ctx)).toEqual(['e4', 'e5']);
        expect(ctx.emitter.named('premove_discarded')).toEqual([
            {
                room: 'player:g:white-user',
                event: 'premove_discarded',
                args: [{ game_id: 'g', reason: 'illegal_move' }],
            },
        ]);
        expect(ctx.gameStore.state.get('g').premove).toBeNull();
    });

    test('a premove that mates ends the game through the finalizer, at the same instant', async () => {
        // 1. f3 e5 2. g4 — Black premoves Qh4# during White's second move.
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        await move(ctx, W, 'f2', 'f3');
        await move(ctx, B, 'e7', 'e5');
        await premove(ctx, B, 'd8', 'h4');
        expect(await move(ctx, W, 'g2', 'g4')).toEqual({ ok: true });
        expect(ctx.emitter.named('game_end').map((e) => e.args[0])).toEqual([
            expect.objectContaining({ result: 'Black wins', reason: 'Checkmate' }),
        ]);
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
    });

    test('a move that ends the game drops the premove; the game is not continued', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        await move(ctx, W, 'f2', 'f3');
        await move(ctx, B, 'e7', 'e5');
        await move(ctx, W, 'g2', 'g4');
        await premove(ctx, W, 'a2', 'a3');
        expect(await move(ctx, B, 'd8', 'h4')).toEqual({ ok: true });
        expect(sans(ctx)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
        expect(ctx.emitter.named('premove_discarded')).toEqual([]);
        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', premove: null });
    });

    test('a takeback drops the premove', async () => {
        const ctx = await afterE4();
        await move(ctx, B, 'e7', 'e5');
        await premove(ctx, B, 'g8', 'f6');
        await ctx.svc.requestTakeback({ game_id: 'g' }, B);
        await ctx.svc.acceptTakeback({ game_id: 'g' }, W);
        expect(ctx.gameStore.state.get('g').premove).toBeNull();
    });
});

test('reconnect: only the owner’s game_state_sync carries the premove', async () => {
    const ctx = await afterE4();
    await premove(ctx, W, 'g1', 'f3');
    const owner = fakeClient('s1');
    const other = fakeClient('s2');
    await ctx.svc.joinGame('g', owner, W);
    await ctx.svc.joinGame('g', other, B);
    expect(owner.emitted[0].args[0].premove).toEqual({ from: 'g1', to: 'f3' });
    expect(other.emitted[0].args[0]).not.toHaveProperty('premove');
});
