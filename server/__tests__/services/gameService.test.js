/**
 * src/services/gameService.js (+ moveRecorder) with in-memory ports and injected time.
 */
const { createGameService } = require('../../src/services/gameService');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeClient, fakeGameStore, result, flush } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const T = 2_000_000;
const NEXT_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

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

describe('makeMove: the server is the authority [S1][S10]', () => {
    const E4 = { game_id: 'g', from: 'e2', to: 'e4' };

    test('legal move: server-computed fen/san/uci, clocks charged, broadcast, then persisted', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', lastMoveAt: T - 3000, incrementMs: 2000 }) });
        // Everything a cheating client might add is ignored.
        const data = { ...E4, promotion: 'q', fen: 'client-fen', san: 'Qxf7#', move: 'd1f7', captured: true };
        expect(await ctx.svc.makeMove(data, 'white-user', fakeClient())).toEqual({ ok: true });
        await flush();

        expect(ctx.gameStore.state.get('g')).toMatchObject({
            fen: NEXT_FEN,
            activeSide: 'b',
            whiteClockMs: 599000,
            lastMoveAt: T,
            moveLog: [{ move: 'e2e4', fen: NEXT_FEN, san: 'e4' }],
        });
        expect(ctx.emitter.sent).toEqual([
            {
                room: 'game_g',
                event: 'move_made',
                args: [
                    {
                        game_id: 'g',
                        from: 'e2',
                        to: 'e4',
                        move: 'e2e4',
                        san: 'e4',
                        fen: NEXT_FEN,
                        captured: false,
                        flags: 'b',
                        whiteMs: 599000,
                        blackMs: 600000,
                    },
                ],
            },
        ]);
        expect(ctx.movesRepo.insert).toHaveBeenCalledWith({
            game_id: 'g',
            move_number: 1,
            color: 'white',
            uci: 'e2e4',
            san: 'e4',
            fen_after: NEXT_FEN,
            clock_ms_remaining: 599000,
        });
        expect(ctx.gamesRepo.updateById).toHaveBeenCalledWith('g', { fen: NEXT_FEN });
    });

    test('a promotion reports the promoted piece', async () => {
        const fen = '8/P6k/8/8/8/8/7K/8 w - - 0 1';
        const ctx = setup({ g: makeGame({ id: 'g', fen, startFen: fen }) });
        await ctx.svc.makeMove({ game_id: 'g', from: 'a7', to: 'a8', promotion: 'r' }, 'white-user', fakeClient());
        expect(ctx.emitter.named('move_made')[0].args[0]).toMatchObject({ move: 'a7a8r', san: 'a8=R', promotion: 'r' });
    });

    test('illegal move: rejected to the sender with a fresh sync; nothing stored, broadcast or persisted', async () => {
        const game = makeGame({ id: 'g' });
        const ctx = setup({ g: game });
        const client = fakeClient('sw');
        const out = await ctx.svc.makeMove({ game_id: 'g', from: 'e2', to: 'e5', fen: 'client-fen' }, 'white-user', client);
        await flush();
        expect(out).toEqual({ ok: false, error: 'illegal_move' });
        expect(client.emitted).toEqual([
            { event: 'move_rejected', args: [{ game_id: 'g', reason: 'illegal_move' }] },
            { event: 'game_state_sync', args: [expect.objectContaining({ fen: game.fen, moveLog: [], activeSide: 'w' })] },
        ]);
        expect(ctx.gameStore.state.get('g')).toEqual(game);
        expect(ctx.emitter.sent).toEqual([]);
        expect(ctx.movesRepo.insert).not.toHaveBeenCalled();
        expect(ctx.gamesRepo.updateById).not.toHaveBeenCalled();
    });

    test.each([
        ['out of turn', 'black-user', { game_id: 'g', from: 'e7', to: 'e5' }, 'not_your_turn'],
        ['by a spectator', 'stranger', E4, 'not_a_player'],
    ])('a move %s is rejected and changes nothing', async (_name, userId, data, reason) => {
        const game = makeGame({ id: 'g' });
        const ctx = setup({ g: game });
        const client = fakeClient();
        expect(await ctx.svc.makeMove(data, userId, client)).toEqual({ ok: false, error: reason });
        expect(client.emitted[0]).toEqual({ event: 'move_rejected', args: [{ game_id: 'g', reason }] });
        expect(client.emitted[1].event).toBe('game_state_sync');
        expect(ctx.gameStore.state.get('g')).toEqual(game);
        expect(ctx.emitter.sent).toEqual([]);
    });

    test('a move on a finished game is rejected and the sender is told the result', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', status: 'completed', result: 'black', reason: 'Checkmate' }) });
        const client = fakeClient();
        expect(await ctx.svc.makeMove(E4, 'white-user', client)).toEqual({ ok: false, error: 'game_not_active' });
        expect(client.emitted.map((e) => e.event)).toEqual(['move_rejected', 'game_end']);
        expect(ctx.emitter.sent).toEqual([]);
    });

    test('a move for a game the server does not hold is rejected (no client state is adopted)', async () => {
        const ctx = setup();
        const client = fakeClient();
        expect(await ctx.svc.makeMove({ ...E4, fen: NEXT_FEN }, 'white-user', client)).toEqual({
            ok: false,
            error: 'game_not_found',
        });
        expect(client.emitted).toEqual([{ event: 'move_rejected', args: [{ game_id: 'g', reason: 'game_not_found' }] }]);
        expect(ctx.gameStore.state.has('g')).toBe(false);
    });

    test('the same move submitted twice is applied once', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        // The fake store has no lock; serialise like the real per-game lock does.
        let chain = Promise.resolve();
        const mutate = ctx.gameStore.mutateGame.getMockImplementation();
        ctx.gameStore.mutateGame.mockImplementation((id, fn) => (chain = chain.then(() => mutate(id, fn))));
        const results = await Promise.all([
            ctx.svc.makeMove(E4, 'white-user', fakeClient()),
            ctx.svc.makeMove(E4, 'white-user', fakeClient()),
        ]);
        expect(results).toEqual([{ ok: true }, { ok: false, error: 'not_your_turn' }]);
        expect(ctx.emitter.named('move_made')).toHaveLength(1);
        expect(ctx.gameStore.state.get('g').moveLog).toHaveLength(1);
    });

    test('there is no engine dependency to fall back on [S10]', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        expect(ctx.engineClient).toBeUndefined();
        const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('engine down'));
        expect(await ctx.svc.makeMove(E4, 'white-user', fakeClient())).toEqual({ ok: true });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('an unusable stored position fails closed (throws; nothing is written)', async () => {
        const game = makeGame({ id: 'g', fen: 'garbage w - - 0 1' });
        const ctx = setup({ g: game });
        await expect(ctx.svc.makeMove(E4, 'white-user', fakeClient())).rejects.toThrow();
        expect(ctx.gameStore.state.get('g')).toEqual(game);
        expect(ctx.emitter.sent).toEqual([]);
    });
});

describe('results are decided by the server [S3]', () => {
    const MATE_IN_ONE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';

    test('a checkmating move ends the game: move_made, then game_end, then finalization', async () => {
        const ctx = setup({ g: makeGame({ id: 'g', fen: MATE_IN_ONE, startFen: MATE_IN_ONE, activeSide: 'b' }) });
        expect(await ctx.svc.makeMove({ game_id: 'g', from: 'd8', to: 'h4' }, 'black-user', fakeClient())).toEqual({ ok: true });
        await flush();

        expect(ctx.emitter.sent.map((e) => e.event)).toEqual(['move_made', 'game_end']);
        expect(ctx.emitter.named('game_end')[0].args[0]).toEqual({
            game_id: 'g',
            result: 'Black wins',
            reason: 'Checkmate',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', result: 'black', reason: 'Checkmate' });
        expect(ctx.gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ result: 'black', winner_id: 'black-user' });
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledWith('g', 'white-user', 'black-user', 'black', '10', true);
    });

    test('a stalemating move ends the game as a draw', async () => {
        // White: Kg6, Qe7 → Qf7 stalemates the king on h8.
        const fen = '7k/4Q3/6K1/8/8/8/8/8 w - - 0 1';
        const ctx = setup({ g: makeGame({ id: 'g', fen, startFen: fen }) });
        await ctx.svc.makeMove({ game_id: 'g', from: 'e7', to: 'f7' }, 'white-user', fakeClient());
        expect(ctx.emitter.named('game_end')[0].args[0]).toMatchObject({ result: 'Draw', reason: 'Stalemate' });
        expect(ctx.gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ result: 'draw', winner_id: null });
    });

    test('an ordinary move does not end the game', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        await ctx.svc.makeMove({ game_id: 'g', from: 'e2', to: 'e4' }, 'white-user', fakeClient());
        expect(ctx.emitter.named('game_end')).toEqual([]);
        expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
    });

    test('there is no client-facing endGame: a result can only come from a move, a resignation or the clock', () => {
        const ctx = setup();
        expect(ctx.svc.endGame).toBeUndefined();
    });
});

describe('resign [S3]', () => {
    test.each([
        ['white-user', 'Black wins', 'black'],
        ['black-user', 'White wins', 'white'],
    ])('%s resigning → %s by Resignation', async (userId, label, stored) => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        expect(await ctx.svc.resign({ game_id: 'g' }, userId)).toEqual({ ok: true });
        expect(ctx.emitter.named('game_end')[0].args[0]).toEqual({
            game_id: 'g',
            result: label,
            reason: 'Resignation',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', result: stored, reason: 'Resignation' });
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
    });

    test('resigning is allowed on the opponent’s turn', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) }); // white to move
        expect(await ctx.svc.resign({ game_id: 'g' }, 'black-user')).toEqual({ ok: true });
    });

    test.each([
        ['a spectator', 'g', 'stranger', 'not_a_player'],
        ['an unknown game', 'nope', 'white-user', 'game_not_found'],
    ])('%s cannot resign a game', async (_name, gameId, userId, reason) => {
        const game = makeGame({ id: 'g' });
        const ctx = setup({ g: game });
        expect(await ctx.svc.resign({ game_id: gameId }, userId)).toEqual({ ok: false, error: reason });
        expect(ctx.gameStore.state.get('g')).toEqual(game);
        expect(ctx.emitter.sent).toEqual([]);
        expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
    });

    test('a finished game cannot be resigned (no second result, no second rating)', async () => {
        const ctx = setup({ g: makeGame({ id: 'g' }) });
        await ctx.svc.resign({ game_id: 'g' }, 'white-user');
        expect(await ctx.svc.resign({ game_id: 'g' }, 'black-user')).toEqual({ ok: false, error: 'game_not_active' });
        expect(ctx.emitter.named('game_end')).toHaveLength(1);
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
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
