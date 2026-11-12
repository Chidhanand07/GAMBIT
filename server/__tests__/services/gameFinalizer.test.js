/**
 * src/services/gameFinalizer.js — the ONE way a game ends by a move or a
 * resignation [S3] (NODE-16, NODE-18): exactly once, decided by the server.
 */
const { createGameFinalizer } = require('../../src/services/gameFinalizer');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeGameStore, result } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

function setup(game = makeGame({ id: 'g' })) {
    const gameStore = fakeGameStore({ [game.id]: game });
    gameStore.active.add(game.id);
    const emitter = fakeEmitter();
    const sessions = createSessionRegistry();
    sessions.setActiveGame('white-user', game.id);
    sessions.setActiveGame('black-user', game.id);
    const gamesRepo = { finishIfActive: jest.fn(() => result({ id: game.id })) };
    const ratingService = { processGameEnd: jest.fn(async () => null) };
    const reviewService = { triggerGameReview: jest.fn() };
    const finalizer = createGameFinalizer({ gameStore, gamesRepo, ratingService, reviewService, sessions, emitter });
    return { finalizer, gameStore, emitter, sessions, gamesRepo, ratingService, reviewService };
}

afterEach(() => jest.restoreAllMocks());

test('a decisive result: Redis, active set, broadcast, session links, DB row, review and rating', async () => {
    const game = makeGame({
        id: 'g',
        fen: AFTER_E4,
        moveLog: [{ move: 'e2e4', fen: AFTER_E4, san: 'e4' }],
        whiteClockMs: 123456.6,
        blackClockMs: 98765.4,
        timeControl: '5+3',
    });
    const ctx = setup(game);
    ctx.ratingService.processGameEnd.mockResolvedValue({ white: { change: 8 }, black: { change: -8 } });

    expect(await ctx.finalizer.endGame('g', { winner: 'black', reason: 'Checkmate' })).toBe(true);

    expect(ctx.gameStore.state.get('g')).toEqual({
        ...game,
        status: 'completed',
        result: 'black',
        reason: 'Checkmate',
    });
    expect(ctx.gameStore.active.has('g')).toBe(false);
    expect(ctx.emitter.named('game_end')).toEqual([
        {
            room: 'game_g',
            event: 'game_end',
            args: [
                {
                    game_id: 'g',
                    result: 'Black wins',
                    reason: 'Checkmate',
                    white_id: 'white-user',
                    black_id: 'black-user',
                },
            ],
        },
    ]);
    expect(ctx.sessions.hasActiveGame('white-user')).toBe(false);
    expect(ctx.sessions.hasActiveGame('black-user')).toBe(false);
    expect(ctx.gamesRepo.finishIfActive).toHaveBeenCalledWith('g', {
        status: 'completed',
        // Was always null for a decisive game, which made every win read back as a draw (G1).
        result: 'black',
        winner_id: 'black-user',
        ended_at: ISO,
        final_fen: AFTER_E4,
        white_clock_ms: 123457,
        black_clock_ms: 98765,
    });
    expect(ctx.reviewService.triggerGameReview).toHaveBeenCalledWith('g', game.moveLog, '5+3');
    expect(ctx.ratingService.processGameEnd).toHaveBeenCalledWith(
        'g',
        'white-user',
        'black-user',
        'black',
        '5+3',
        true,
    );
    expect(ctx.emitter.named('rating_updated')).toEqual([
        { room: 'game_g', event: 'rating_updated', args: [{ white: { change: 8 }, black: { change: -8 } }] },
    ]);
});

test.each([
    ['white', 'White wins', 'white', 'white-user'],
    ['black', 'Black wins', 'black', 'black-user'],
    [null, 'Draw', 'draw', null],
])('winner %p → label %p, stored result %p, winner_id %p', async (winner, label, stored, winnerId) => {
    const ctx = setup();
    await ctx.finalizer.endGame('g', { winner, reason: 'Stalemate' });
    expect(ctx.emitter.named('game_end')[0].args[0].result).toBe(label);
    expect(ctx.gameStore.state.get('g').result).toBe(stored);
    expect(ctx.gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ result: stored, winner_id: winnerId });
    expect(ctx.ratingService.processGameEnd.mock.calls[0][3]).toBe(stored);
});

describe('exactly once', () => {
    test('a game that is not active is left alone', async () => {
        const game = makeGame({ id: 'g', status: 'completed', result: 'white', reason: 'Time' });
        const ctx = setup(game);
        expect(await ctx.finalizer.endGame('g', { winner: 'black', reason: 'Resignation' })).toBe(false);
        expect(ctx.gameStore.state.get('g')).toEqual(game);
        expect(ctx.emitter.sent).toEqual([]);
        expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
        expect(ctx.ratingService.processGameEnd).not.toHaveBeenCalled();
    });

    test('an unknown game is left alone', async () => {
        const ctx = setup();
        expect(await ctx.finalizer.endGame('nope', { winner: null, reason: 'Stalemate' })).toBe(false);
        expect(ctx.emitter.sent).toEqual([]);
    });

    test('two finalizers racing: one wins, one broadcast, one rating update', async () => {
        const ctx = setup();
        // Serialise like the real per-game lock (the fake store has none).
        let chain = Promise.resolve();
        const mutate = ctx.gameStore.mutateGame.getMockImplementation();
        ctx.gameStore.mutateGame.mockImplementation((id, fn) => (chain = chain.then(() => mutate(id, fn))));

        const outcomes = await Promise.all([
            ctx.finalizer.endGame('g', { winner: 'white', reason: 'Checkmate' }),
            ctx.finalizer.endGame('g', { winner: 'black', reason: 'Resignation' }),
        ]);
        expect(outcomes).toEqual([true, false]);
        expect(ctx.emitter.named('game_end')).toHaveLength(1);
        expect(ctx.emitter.named('game_end')[0].args[0]).toMatchObject({ result: 'White wins', reason: 'Checkmate' });
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledTimes(1);
        expect(ctx.gameStore.state.get('g')).toMatchObject({ result: 'white', reason: 'Checkmate' });
    });

    test('the DB says someone else already finalized (e.g. the clock): broadcast stands, no review, no rating', async () => {
        const ctx = setup();
        ctx.gamesRepo.finishIfActive.mockReturnValue(result(null));
        expect(await ctx.finalizer.endGame('g', { winner: 'white', reason: 'Checkmate' })).toBe(true);
        expect(ctx.reviewService.triggerGameReview).not.toHaveBeenCalled();
        expect(ctx.ratingService.processGameEnd).not.toHaveBeenCalled();
        expect(ctx.emitter.named('rating_updated')).toEqual([]);
    });
});

describe('settings come from server state only', () => {
    test('missing time control / rated flag fall back to fixed defaults, never to a client value', async () => {
        const ctx = setup(makeGame({ id: 'g', timeControl: undefined, isRated: undefined, fen: undefined }));
        await ctx.finalizer.endGame('g', { winner: null, reason: 'Stalemate' });
        expect(ctx.ratingService.processGameEnd).toHaveBeenCalledWith(
            'g',
            'white-user',
            'black-user',
            'draw',
            '10',
            false,
        );
        expect(ctx.gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ final_fen: null });
    });

    test('rating returning null (unrated game) → no rating_updated', async () => {
        const ctx = setup(makeGame({ id: 'g', isRated: false }));
        await ctx.finalizer.endGame('g', { winner: 'white', reason: 'Resignation' });
        expect(ctx.ratingService.processGameEnd.mock.calls[0][5]).toBe(false);
        expect(ctx.emitter.named('rating_updated')).toEqual([]);
    });
});

test('a game with an empty seat cannot be finalized', async () => {
    const ctx = setup(makeGame({ id: 'g', blackId: null }));
    expect(await ctx.finalizer.endGame('g', { winner: 'white', reason: 'Resignation' })).toBe(false);
    expect(ctx.emitter.sent).toEqual([]);
});

describe('endGameIf: the verdict is decided on the state under the lock [G3]', () => {
    test('the decision function sees the current state and its verdict ends the game', async () => {
        const ctx = setup(makeGame({ id: 'g', blackClockMs: 0 }));
        const decide = jest.fn((game) => (game.blackClockMs === 0 ? { winner: 'white', reason: 'Time' } : null));
        expect(await ctx.finalizer.endGameIf('g', decide)).toBe(true);
        expect(decide).toHaveBeenCalledWith(expect.objectContaining({ id: 'g', status: 'active' }));
        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', result: 'white', reason: 'Time' });
        expect(ctx.emitter.named('game_end')).toHaveLength(1);
    });

    test('no verdict → nothing changes, nothing is broadcast or persisted', async () => {
        const ctx = setup();
        expect(await ctx.finalizer.endGameIf('g', () => null)).toBe(false);
        expect(ctx.gameStore.state.get('g').status).toBe('active');
        expect(ctx.emitter.sent).toEqual([]);
        expect(ctx.gamesRepo.finishIfActive).not.toHaveBeenCalled();
    });

    test('the decision function is not even asked about a game that is not active', async () => {
        const ctx = setup(makeGame({ id: 'g', status: 'completed', result: 'black' }));
        const decide = jest.fn(() => ({ winner: 'white', reason: 'Time' }));
        expect(await ctx.finalizer.endGameIf('g', decide)).toBe(false);
        expect(await ctx.finalizer.endGameIf('unknown', decide)).toBe(false);
        expect(decide).not.toHaveBeenCalled();
    });
});

describe('an aborted game: no winner, no rating, no review [FIRST-MOVE]', () => {
    const ABORT = { winner: null, reason: 'Aborted', aborted: true };

    test('Redis, broadcast and the database row', async () => {
        const game = makeGame({ id: 'g', isRated: true });
        const ctx = setup(game);
        expect(await ctx.finalizer.endGame('g', ABORT)).toBe(true);

        expect(ctx.gameStore.state.get('g')).toMatchObject({ status: 'completed', result: 'aborted', reason: 'Aborted' });
        expect(ctx.gameStore.active.has('g')).toBe(false);
        expect(ctx.emitter.named('game_end')[0].args[0]).toEqual({
            game_id: 'g',
            result: 'Aborted',
            reason: 'Aborted',
            white_id: 'white-user',
            black_id: 'black-user',
        });
        expect(ctx.gamesRepo.finishIfActive).toHaveBeenCalledWith('g', {
            status: 'aborted',
            result: null,
            winner_id: null,
            ended_at: ISO,
            final_fen: game.fen,
            white_clock_ms: 600000,
            black_clock_ms: 600000,
        });
        expect(ctx.sessions.activeGameOf('white-user')).toBeUndefined();
    });

    test('a rated game that is aborted changes no rating and is not reviewed', async () => {
        const ctx = setup(makeGame({ id: 'g', isRated: true }));
        await ctx.finalizer.endGame('g', ABORT);
        expect(ctx.ratingService.processGameEnd).not.toHaveBeenCalled();
        expect(ctx.reviewService.triggerGameReview).not.toHaveBeenCalled();
        expect(ctx.emitter.named('rating_updated')).toEqual([]);
    });
});
