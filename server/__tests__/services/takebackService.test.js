/**
 * Takebacks through the game service: takeback_pref / _request / _accept / _decline
 * [TAKEBACK] (ADR F-152).
 */
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeClient, fakeGameStore, result, flush } = require('./fakes');
const { makeGame, START_FEN } = require('../helpers/fixtures');

const T = 5_000_000;
const W = 'white-user';
const B = 'black-user';
const G = { game_id: 'g' };
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

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
    const movesRepo = { insert: jest.fn(() => result()), deleteAfter: jest.fn(() => result()) };
    const ratingService = { processGameEnd: jest.fn(async () => null) };
    const reviewService = { triggerGameReview: jest.fn() };
    const deps = { gameStore, gamesRepo, movesRepo, ratingService, reviewService, sessions, emitter };
    let now = T;
    const svc = createGameService({ ...deps, now: () => now });
    return { svc, ...deps, advance: (ms) => (now += ms) };
}

const move = (ctx, userId, from, to) => ctx.svc.makeMove({ game_id: 'g', from, to }, userId, fakeClient());

/** 1. e4 (White thought 1 s) e5 (Black thought 3 s); both players allow takebacks. */
async function played() {
    const ctx = setup({
        g: makeGame({
            id: 'g',
            lastMoveAt: null,
            startedAt: T,
            timeControl: '1+2',
            incrementMs: 2000,
            whiteClockMs: 60_000,
            blackClockMs: 60_000,
        }),
    });
    await ctx.svc.setTakebackPref({ game_id: 'g', allow: true }, W);
    await ctx.svc.setTakebackPref({ game_id: 'g', allow: true }, B);
    await move(ctx, W, 'e2', 'e4');
    ctx.advance(3000);
    await move(ctx, B, 'e7', 'e5');
    ctx.advance(1000);
    ctx.emitter.sent.length = 0;
    return ctx;
}

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('takeback_pref', () => {
    test('stores the player’s setting and tells the room; repeating it changes nothing', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        expect(await ctx.svc.setTakebackPref({ game_id: 'g', allow: true }, B)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').takebackPrefs).toEqual({ black: true });
        expect(ctx.emitter.sent).toEqual([
            { room: 'game_g', event: 'takeback_prefs', args: [{ game_id: 'g', black: true }] },
        ]);
        expect(await ctx.svc.setTakebackPref({ game_id: 'g', allow: true }, B)).toEqual({ ok: true });
        expect(ctx.emitter.sent).toHaveLength(1);
    });

    test('a spectator has no setting here', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        expect(await ctx.svc.setTakebackPref({ game_id: 'g', allow: true }, 'stranger')).toEqual({
            ok: false,
            error: 'not_a_player',
        });
    });
});

describe('takeback_request', () => {
    test('White asks to undo its last move after Black replied: two plies; the room is told', async () => {
        const ctx = await played();
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').takeback).toEqual({ by: 'white', plies: 2, ply: 2, at: T + 4000 });
        expect(ctx.emitter.sent).toEqual([
            { room: 'game_g', event: 'takeback_requested', args: [{ game_id: 'g', by: 'white', plies: 2 }] },
        ]);
    });

    test.each([
        ['a spectator', 'stranger', 'not_a_player'],
        ['an unknown game', W, 'game_not_found', 'nope'],
    ])('%s: refused', async (_n, userId, error, gameId = 'g') => {
        const ctx = await played();
        expect(await ctx.svc.requestTakeback({ game_id: gameId }, userId)).toEqual({ ok: false, error });
        expect(ctx.emitter.sent).toEqual([]);
    });

    test('the opponent has not allowed takebacks: takebacks_disabled', async () => {
        const ctx = await played();
        await ctx.svc.setTakebackPref({ game_id: 'g', allow: false }, B);
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: false, error: 'takebacks_disabled' });
    });

    test('a finished game: game_not_active', async () => {
        const ctx = await played();
        await ctx.svc.resign(G, B);
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: false, error: 'game_not_active' });
    });

    test('nothing of mine to undo; a second request while one stands; the cooldown', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', takebackPrefs: { white: true, black: true } }) });
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: false, error: 'takeback_nothing_to_undo' });
        await move(ctx, W, 'e2', 'e4');
        expect(await ctx.svc.requestTakeback(G, B)).toEqual({ ok: false, error: 'takeback_nothing_to_undo' });
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: true });
        expect(await ctx.svc.requestTakeback(G, B)).toEqual({ ok: false, error: 'takeback_pending' });
        await ctx.svc.declineTakeback(G, B);
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: false, error: 'takeback_cooldown' });
        ctx.advance(15_000);
        expect(await ctx.svc.requestTakeback(G, W)).toEqual({ ok: true });
    });
});

describe('takeback_accept', () => {
    test('rolls back position, log and clocks to the snapshot; broadcasts the restored state; persists', async () => {
        const ctx = await played();
        // White is to move, so Black moved last: Black's request undoes one ply (e5).
        await ctx.svc.requestTakeback(G, B);
        ctx.emitter.sent.length = 0;
        expect(await ctx.svc.acceptTakeback(G, W)).toEqual({ ok: true });
        const state = ctx.gameStore.state.get('g');
        // After e4: White 60 s (no clock before the first move) + 2 s increment, Black 60 s.
        expect(state).toMatchObject({
            fen: AFTER_E4,
            moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
            clockLog: [{ whiteMs: 62_000, blackMs: 60_000 }],
            whiteClockMs: 62_000,
            blackClockMs: 60_000,
            activeSide: 'b',
            lastMoveAt: T + 4000,
            takeback: null,
        });
        expect(ctx.emitter.sent).toEqual([
            {
                room: 'game_g',
                event: 'takeback_applied',
                args: [
                    {
                        game_id: 'g',
                        plies: 1,
                        fen: AFTER_E4,
                        moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
                        whiteMs: 62_000,
                        blackMs: 60_000,
                        activeSide: 'b',
                        clockActive: true,
                    },
                ],
            },
        ]);
        await flush();
        expect(ctx.movesRepo.deleteAfter).toHaveBeenCalledWith('g', 1);
        expect(ctx.gamesRepo.updateById).toHaveBeenLastCalledWith('g', {
            fen: AFTER_E4,
            white_clock_ms: 62_000,
            black_clock_ms: 60_000,
        });
        // Black, to move again, can play another move from the restored position.
        expect(await move(ctx, B, 'c7', 'c5')).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').moveLog.map((m) => m.san)).toEqual(['e4', 'c5']);
    });

    test('two plies back to the start: the start position, starting clocks, the clock stopped', async () => {
        const ctx = await played();
        await ctx.svc.requestTakeback(G, W);
        expect(await ctx.svc.acceptTakeback(G, B)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g')).toMatchObject({
            fen: START_FEN,
            moveLog: [],
            whiteClockMs: 60_000,
            blackClockMs: 60_000,
            lastMoveAt: null,
            startedAt: T + 4000,
        });
        await flush();
        expect(ctx.movesRepo.deleteAfter).toHaveBeenCalledWith('g', 0);
    });

    test.each([
        ['no request stands', null, W, 'no_pending_request'],
        ['my own request', W, W, 'no_pending_request'],
        ['a spectator', W, 'stranger', 'not_a_player'],
    ])('%s: refused, nothing rolls back', async (_n, requester, accepter, error) => {
        const ctx = await played();
        if (requester) await ctx.svc.requestTakeback(G, requester);
        expect(await ctx.svc.acceptTakeback(G, accepter)).toEqual({ ok: false, error });
        expect(ctx.gameStore.state.get('g').moveLog).toHaveLength(2);
        expect(ctx.movesRepo.deleteAfter).not.toHaveBeenCalled();
    });

    test('a move clears the request: accepting it afterwards finds nothing', async () => {
        const ctx = await played();
        await ctx.svc.requestTakeback(G, B); // White to move; White moves instead of answering
        await move(ctx, W, 'g1', 'f3');
        expect(ctx.gameStore.state.get('g').takeback).toBeNull();
        expect(await ctx.svc.acceptTakeback(G, W)).toEqual({ ok: false, error: 'no_pending_request' });
    });

    test('a request that a mate overtook: the game is over, nothing rolls back', async () => {
        const ctx = await played();
        await ctx.svc.requestTakeback(G, B);
        await ctx.svc.resign(G, B);
        expect(await ctx.svc.acceptTakeback(G, W)).toEqual({ ok: false, error: 'game_not_active' });
        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', takeback: null });
    });
});

describe('takeback_decline', () => {
    test('clears the request and tells the room who declined', async () => {
        const ctx = await played();
        await ctx.svc.requestTakeback(G, W);
        ctx.emitter.sent.length = 0;
        expect(await ctx.svc.declineTakeback(G, B)).toEqual({ ok: true });
        expect(ctx.gameStore.state.get('g').takeback).toBeNull();
        expect(ctx.emitter.sent).toEqual([
            { room: 'game_g', event: 'takeback_declined', args: [{ game_id: 'g', by: 'black' }] },
        ]);
        expect(await ctx.svc.declineTakeback(G, B)).toEqual({ ok: false, error: 'no_pending_request' });
    });
});

test('reconnect: game_state_sync carries the standing request and both settings', async () => {
    const ctx = await played();
    await ctx.svc.requestTakeback(G, W);
    const client = fakeClient('s9');
    await ctx.svc.joinGame('g', client, B);
    expect(client.emitted[0].args[0]).toMatchObject({
        fen: AFTER_E5,
        takeback: { by: 'white', plies: 2 },
        takebackPrefs: { white: true, black: true },
    });
});
