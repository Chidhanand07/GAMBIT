/**
 * src/services/gameService.js (+ moveRecorder) with in-memory ports and injected time.
 */
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeClient, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const T = 2_000_000;
const NEXT_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function setup(games = {}, { engine } = {}) {
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
    const engineClient = {
        validateMove: jest.fn(
            engine ?? (async () => ({ ok: true, json: async () => ({ valid: true, new_fen: NEXT_FEN }) })),
        ),
    };
    const ratingService = { processGameEnd: jest.fn(async () => null) };
    const reviewService = { triggerGameReview: jest.fn() };
    const deps = { gameStore, gamesRepo, movesRepo, engineClient, ratingService, reviewService, sessions, emitter };
    const svc = createGameService({ ...deps, now: () => T });
    return { svc, ...deps };
}

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('joinGame', () => {
    test('joins the room, links the user and syncs the running clock', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', lastMoveAt: T - 1000 }) });
        const client = fakeClient('s1');
        await ctx.svc.joinGame('g', client, 'white-user');
        expect(client.joined).toEqual(['game_g']);
        expect(ctx.sessions.activeGameOf('white-user')).toBe('g');
        expect(client.emitted[0]).toEqual({
            event: 'game_state_sync',
            args: [expect.objectContaining({ whiteMs: 599000, blackMs: 600000, clockActive: true })],
        });
    });

    test('a non-participant joins as a spectator: room + state, but never linked to the game [S9]', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        const client = fakeClient('s2');
        await ctx.svc.joinGame('g', client, 'stranger');
        expect(client.joined).toEqual(['game_g']);
        expect(client.emitted[0].event).toBe('game_state_sync');
        expect(ctx.sessions.hasActiveGame('stranger')).toBe(false);

        await ctx.svc.handleDisconnect('stranger');
        expect(ctx.gameStore.state.get('g').disconnectInfo).toBeNull();
        expect(ctx.emitter.named('opponent_disconnected')).toEqual([]);
    });

    test('joining a game that is not in Redis or the DB links nobody [S9]', async () => {
        const ctx = setup();
        await ctx.svc.joinGame('ghost', fakeClient(), 'white-user');
        expect(ctx.sessions.hasActiveGame('white-user')).toBe(false);
    });

    test('a stale link to a game the user does not play in cannot trigger abandonment [S9]', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        ctx.sessions.setActiveGame('stranger', 'g');
        await ctx.svc.handleDisconnect('stranger');
        expect(ctx.gameStore.state.get('g').disconnectInfo).toBeNull();
        expect(ctx.emitter.named('opponent_disconnected')).toEqual([]);
        expect(ctx.gamesRepo.updateIfActive).not.toHaveBeenCalled();
    });

    test('restores an active DB game into Redis; reports a completed DB game', async () => {
        const ctx = setup();
        ctx.gamesRepo.findForRestore.mockReturnValueOnce(
            result({
                status: 'active',
                white_id: 'w',
                black_id: 'b',
                time_control: '5',
                white_clock_ms: null,
                black_clock_ms: null,
            }),
        );
        await ctx.svc.joinGame('g', fakeClient());
        expect(ctx.gameStore.state.get('g')).toMatchObject({ whiteId: 'w', whiteClockMs: 300000, lastMoveAt: null });
        expect(ctx.gameStore.active.has('g')).toBe(true);

        ctx.gamesRepo.findForRestore.mockReturnValueOnce(
            result({ status: 'completed', result: 'white', white_id: 'w', black_id: 'b' }),
        );
        const client = fakeClient();
        await ctx.svc.joinGame('other', client);
        expect(client.emitted).toEqual([
            {
                event: 'game_end',
                args: [{ game_id: 'other', result: 'White wins', reason: 'Game over', white_id: 'w', black_id: 'b' }],
            },
        ]);
    });
});

describe('makeMove', () => {
    test('validated move: engine FEN, clocks charged, broadcast, then persisted', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', lastMoveAt: T - 3000, incrementMs: 2000 }) });
        ctx.sessions.register('white-user', 's1');
        const data = { game_id: 'g', move: 'e2e4', fen: 'client-fen', san: 'e4', extra: 1 };
        await ctx.svc.makeMove(data, 's1');
        await flush();

        expect(ctx.gameStore.state.get('g')).toMatchObject({
            fen: NEXT_FEN,
            activeSide: 'b',
            whiteClockMs: 599000,
            lastMoveAt: T,
        });
        expect(ctx.emitter.sent).toEqual([
            {
                room: 'game_g',
                event: 'move_made',
                args: [{ ...data, fen: NEXT_FEN, whiteMs: 599000, blackMs: 600000 }],
            },
        ]);
        expect(ctx.movesRepo.insert).toHaveBeenCalledWith(
            expect.objectContaining({ move_number: 1, color: 'white', uci: 'e2e4', clock_ms_remaining: 599000 }),
        );
        expect(ctx.gamesRepo.updateById).toHaveBeenCalledWith('g', { fen: NEXT_FEN });
    });

    test('wrong player, illegal move → nothing happens', async () => {
        const ctx = setup(
            { g: makeGame({ id: 'g' }) },
            { engine: async () => ({ ok: true, json: async () => ({ valid: false }) }) },
        );
        ctx.sessions.register('black-user', 'sb');
        ctx.sessions.register('white-user', 'sw');
        await ctx.svc.makeMove({ game_id: 'g', move: 'e7e5' }, 'sb');
        await ctx.svc.makeMove({ game_id: 'g', move: 'e2e5' }, 'sw');
        expect(ctx.emitter.sent).toHaveLength(0);
        expect(console.warn).toHaveBeenCalledWith('[make_move] illegal move rejected:', 'e2e5', 'from', makeGame().fen);
    });

    test('engine unreachable → the client FEN is accepted (known bug, pinned)', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) }, { engine: async () => Promise.reject(new Error('down')) });
        ctx.sessions.register('white-user', 'sw');
        await ctx.svc.makeMove({ game_id: 'g', move: 'e2e4', fen: 'client-fen' }, 'sw');
        expect(ctx.gameStore.state.get('g').fen).toBe('client-fen');
    });
});

describe('endGame', () => {
    test('completes, broadcasts the client payload, unlinks users, finalizes, reviews and rates', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', moveLog: [{ san: 'e4' }] }) });
        ctx.sessions.setActiveGame('white-user', 'g');
        ctx.ratingService.processGameEnd.mockResolvedValue({ white: { change: 8 } });
        await ctx.svc.endGame({ game_id: 'g', result: 'Black wins', note: 'x' });

        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', result: 'black' });
        expect(ctx.sessions.hasActiveGame('white-user')).toBe(false);
        expect(ctx.emitter.named('game_end')[0].args[0]).toEqual({
            game_id: 'g',
            result: 'Black wins',
            note: 'x',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        expect(ctx.gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ result: null, winner_id: 'black-user' });
        expect(ctx.reviewService.triggerGameReview).toHaveBeenCalledWith('g', [{ san: 'e4' }], '10');
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledWith(
            'g',
            'white-user',
            'black-user',
            'black',
            '10',
            true,
        );
        expect(ctx.emitter.named('rating_updated')).toHaveLength(1);
    });

    test('already finalized in the DB → no review, no rating', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        ctx.gamesRepo.finishIfActive.mockReturnValue(result(null));
        await ctx.svc.endGame({ game_id: 'g', result: 'Draw' });
        expect(ctx.reviewService.triggerGameReview).not.toHaveBeenCalled();
        expect(ctx.ratingService.processGameEnd).not.toHaveBeenCalled();
    });
});

describe('disconnect and reconnect', () => {
    test('disconnect freezes the clock and starts the grace period; reconnect clears it', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', lastMoveAt: T - 2000 }) });
        ctx.sessions.setActiveGame('black-user', 'g');
        await ctx.svc.handleDisconnect('black-user');

        expect(ctx.gameStore.state.get('g')).toMatchObject({
            whiteClockMs: 598000,
            disconnectInfo: { userId: 'black-user', side: 'black', at: T },
        });
        expect(ctx.gamesRepo.updateIfActive).toHaveBeenCalledWith('g', {
            white_time_ms: 598000,
            black_time_ms: 600000,
        });
        expect(ctx.emitter.sent).toEqual([
            { room: 'game_g', event: 'opponent_disconnected', args: [{ userId: 'black-user', timeoutSeconds: 20 }] },
        ]);

        const client = fakeClient();
        await ctx.svc.reconnect('black-user', client);
        expect(ctx.gameStore.state.get('g')).toMatchObject({ disconnectInfo: null, lastMoveAt: T });
        expect(client.joined).toEqual(['game_g']);
        expect(client.emitted).toEqual([{ event: 'clock_sync', args: [{ whiteMs: 598000, blackMs: 600000 }] }]);
    });

    test('no user / no active game → nothing', async () => {
        const ctx = setup();
        await ctx.svc.handleDisconnect(undefined);
        await ctx.svc.handleDisconnect('nobody');
        await ctx.svc.reconnect('nobody', fakeClient());
        expect(ctx.gameStore.getGame).not.toHaveBeenCalled();
    });
});

test('spectate joins only existing games', async () => {
    const ctx = setup({ g: makeGame({ id: 'g' }) });
    const client = fakeClient();
    await ctx.svc.spectate('missing', client);
    await ctx.svc.spectate('g', client);
    expect(client.joined).toEqual(['game_g']);
});
