/**
 * src/services/clockService.js with injected time and in-memory ports.
 */
const { createClockService } = require('../../src/services/clockService');
const { createGameFinalizer } = require('../../src/services/gameFinalizer');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { fakeEmitter, fakeGameStore, result } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const T = 1_000_000;

/**
 * The clock ends games through the same finalizer as moves and resignations [G3], so the
 * tests wire the real finalizer over in-memory ports.
 */
function setup(game, { finished = true } = {}) {
    const gameStore = fakeGameStore({ [game.id]: game });
    gameStore.active.add(game.id);
    const emitter = fakeEmitter();
    const rating = { processGameEnd: jest.fn(async () => ({ white: { change: 5 } })) };
    const gamesRepo = { finishIfActive: jest.fn(() => result(finished ? { id: game.id } : null)) };
    const reviewService = { triggerGameReview: jest.fn() };
    const sessions = createSessionRegistry();
    sessions.setActiveGame(game.whiteId, game.id);
    const finalizer = createGameFinalizer({ gameStore, gamesRepo, ratingService: rating, reviewService, sessions, emitter });
    let now = T;
    const svc = createClockService({ gameStore, finalizer, emitter, now: () => now });
    return { svc, gameStore, emitter, rating, gamesRepo, reviewService, sessions, advance: (ms) => (now += ms) };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('broadcasts the running clock with the injected server time', async () => {
    const { svc, emitter } = setup(makeGame({ lastMoveAt: T - 1500, whiteClockMs: 10000 }));
    await svc.tick();
    expect(emitter.sent).toEqual([
        { room: 'game_game-1', event: 'clock_sync', args: [{ whiteMs: 8500, blackMs: 600000, serverTs: T }] },
    ]);
});

const MOVE_LOG = [{ move: 'e2e4', fen: 'after-e4', san: 'e4' }];
const TWO_PLIES = [...MOVE_LOG, { move: 'e7e5', fen: 'after-e5', san: 'e5' }];
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

test('flag fall goes through the one finalizer: same payload, DB row, rating and review as any ending [G3]', async () => {
    const { svc, emitter, gameStore, rating, gamesRepo, reviewService, sessions } = setup(
        makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b', fen: 'after-e4', moveLog: MOVE_LOG }),
    );
    await svc.tick();

    expect(gameStore.state.get('game-1')).toMatchObject({ status: 'completed', result: 'white', reason: 'Time' });
    expect(gameStore.active.size).toBe(0);
    // The same five fields every other ending sends; no is_rated / time_control extras.
    expect(emitter.named('game_end')[0].args[0]).toEqual({
        game_id: 'game-1',
        result: 'White wins',
        reason: 'Time',
        white_id: 'white-user',
        black_id: 'black-user',
    });
    // The full finished row: result and clocks were never written by the old clock path.
    expect(gamesRepo.finishIfActive.mock.calls[0][1]).toEqual({
        status: 'completed',
        result: 'white',
        winner_id: 'white-user',
        ended_at: ISO,
        final_fen: 'after-e4',
        white_clock_ms: 600000,
        // The side that ran out is recorded with no time left [G11].
        black_clock_ms: 0,
    });
    expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'white', '10', true);
    expect(emitter.named('rating_updated')).toHaveLength(1);
    // The review was never triggered for games that ended on time.
    expect(reviewService.triggerGameReview).toHaveBeenCalledWith('game-1', MOVE_LOG, '10');
    expect(sessions.activeGameOf('white-user')).toBeUndefined();
});

test('abandonment after the grace period goes through the finalizer too; paused before it [G3]', async () => {
    const info = { userId: 'white-user', side: 'white', at: T };
    const { svc, emitter, advance, gameStore, gamesRepo, reviewService, rating } = setup(
        // Both sides have moved: leaving a game that is underway loses it.
        makeGame({ lastMoveAt: T - 999999, whiteClockMs: 1, disconnectInfo: info, moveLog: TWO_PLIES }),
    );
    await svc.tick();
    expect(emitter.named('game_end')).toHaveLength(0);

    advance(20000);
    await svc.tick();
    expect(emitter.named('game_end')[0].args[0]).toEqual({
        game_id: 'game-1',
        result: 'Black wins',
        reason: 'Abandonment',
        white_id: 'white-user',
        black_id: 'black-user',
    });
    expect(gameStore.state.get('game-1')).toMatchObject({ status: 'completed', result: 'black', reason: 'Abandonment' });
    expect(gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ result: 'black', winner_id: 'black-user', white_clock_ms: 1 });
    expect(reviewService.triggerGameReview).toHaveBeenCalledTimes(1);
    expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'black', '10', true);
});

test('a game the database already finalized is not rated or reviewed again; a rating failure is logged per game', async () => {
    const lost = setup(makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b' }), { finished: false });
    await lost.svc.tick();
    expect(lost.rating.processGameEnd).not.toHaveBeenCalled();
    expect(lost.reviewService.triggerGameReview).not.toHaveBeenCalled();

    const failing = setup(makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b' }));
    failing.rating.processGameEnd.mockRejectedValue(new Error('boom'));
    await failing.svc.tick();
    expect(console.error).toHaveBeenCalledWith('[clock] game game-1 error:', 'boom');
    // The game is over for the players all the same.
    expect(failing.emitter.named('game_end')).toHaveLength(1);
});

test('there is no second finalization path: the clock service exposes only tick()', () => {
    const { svc } = setup(makeGame());
    expect(Object.keys(svc)).toEqual(['tick']);
});

test('a ticker-level failure is logged', async () => {
    const { svc, gameStore } = setup(makeGame());
    gameStore.getActiveGameIds.mockRejectedValue(new Error('redis down'));
    await svc.tick();
    expect(console.error).toHaveBeenCalledWith('[clock] ticker error:', 'redis down');
});

test('a flag fall that loses the race to another ending does nothing (one finalizer wins) [S3]', async () => {
    const game = makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b' });
    const { svc, emitter, gameStore, rating, gamesRepo } = setup(game);
    // The tick reads the game as active, but a resignation completes it before the tick's transition.
    gameStore.getGame.mockImplementationOnce(async () => {
        const stale = structuredClone(gameStore.state.get(game.id));
        gameStore.state.set(game.id, { ...stale, status: 'completed', result: 'black', reason: 'Resignation' });
        return stale;
    });
    await svc.tick();

    expect(gameStore.state.get(game.id)).toMatchObject({ result: 'black', reason: 'Resignation' });
    expect(emitter.named('game_end')).toEqual([]);
    expect(gamesRepo.finishIfActive).not.toHaveBeenCalled();
    expect(rating.processGameEnd).not.toHaveBeenCalled();
});

describe('the clock decides on the state it holds the lock on (review finding 5)', () => {
    /** The tick reads `game`; `change` lands before the tick's own transition. */
    function changeBeforeTransition(gameStore, id, change) {
        gameStore.getGame.mockImplementationOnce(async () => {
            const stale = structuredClone(gameStore.state.get(id));
            gameStore.state.set(id, change(structuredClone(stale)));
            return stale;
        });
    }

    test('a player who reconnects just before the grace period is adjudicated is not forfeited', async () => {
        const game = makeGame({ lastMoveAt: T - 30000, disconnectInfo: { userId: 'white-user', side: 'white', at: T - 21000 } });
        const { svc, emitter, gameStore, gamesRepo } = setup(game);
        changeBeforeTransition(gameStore, game.id, (g) => ({ ...g, disconnectInfo: null, lastMoveAt: T }));
        await svc.tick();

        expect(gameStore.state.get(game.id)).toMatchObject({ status: 'active', disconnectInfo: null });
        expect(emitter.named('game_end')).toEqual([]);
        expect(gamesRepo.finishIfActive).not.toHaveBeenCalled();
    });

    test('a move that beats the flag by a hair is not overruled by a stale read', async () => {
        const game = makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b' });
        const { svc, emitter, gameStore, gamesRepo } = setup(game);
        // Black moved in time: clock charged, increment added, white now to move.
        changeBeforeTransition(gameStore, game.id, (g) => ({ ...g, blackClockMs: 2000, activeSide: 'w', lastMoveAt: T }));
        await svc.tick();

        expect(gameStore.state.get(game.id)).toMatchObject({ status: 'active', activeSide: 'w' });
        expect(emitter.named('game_end')).toEqual([]);
        expect(gamesRepo.finishIfActive).not.toHaveBeenCalled();
    });

    test('the verdict uses the fresh state: the side that is actually out of time loses', async () => {
        const game = makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b' });
        const { svc, emitter, gameStore } = setup(game);
        // State moved on, but black is still the side to move and still out of time.
        changeBeforeTransition(gameStore, game.id, (g) => ({ ...g, moveLog: [{ move: 'e2e4', fen: 'x', san: 'e4' }] }));
        await svc.tick();

        expect(emitter.named('game_end')[0].args[0]).toMatchObject({ result: 'White wins', reason: 'Time' });
        expect(gameStore.state.get(game.id).moveLog).toHaveLength(1);
    });
});

describe('first-move timeout [FIRST-MOVE]', () => {
    test('a game where White never moves is aborted by the ticker, unrated', async () => {
        const { svc, emitter, gameStore, rating, advance } = setup(makeGame({ startedAt: T, lastMoveAt: null }));
        advance(29000);
        await svc.tick();
        expect(emitter.named('game_end')).toEqual([]);
        // No clock has started, so there is nothing to sync.
        expect(emitter.named('clock_sync')).toEqual([]);

        advance(1000);
        await svc.tick();
        expect(emitter.named('game_end')[0].args[0]).toMatchObject({ result: 'Aborted', reason: 'Aborted' });
        expect(gameStore.state.get('game-1')).toMatchObject({ status: 'completed', result: 'aborted' });
        expect(rating.processGameEnd).not.toHaveBeenCalled();
    });

    test('a first move that lands before the abort wins the race', async () => {
        const game = makeGame({ startedAt: T, lastMoveAt: null });
        const { svc, emitter, gameStore, advance } = setup(game);
        advance(30000);
        gameStore.getGame.mockImplementationOnce(async () => {
            const stale = structuredClone(gameStore.state.get(game.id));
            const move = { move: 'e2e4', fen: 'x', san: 'e4' };
            gameStore.state.set(game.id, { ...stale, moveLog: [move], activeSide: 'b', lastMoveAt: T + 29999 });
            return stale;
        });
        await svc.tick();
        expect(emitter.named('game_end')).toEqual([]);
        expect(gameStore.state.get(game.id).status).toBe('active');
    });
});

test('a player who disconnects before any move: the game is aborted after the grace period, unrated [G10]', async () => {
    const info = { userId: 'white-user', side: 'white', at: T };
    const { svc, emitter, gameStore, rating, gamesRepo, advance } = setup(
        makeGame({ startedAt: T, lastMoveAt: null, disconnectInfo: info }),
    );
    advance(19000);
    await svc.tick();
    expect(emitter.named('game_end')).toEqual([]);

    advance(1000);
    await svc.tick();
    expect(emitter.named('game_end')[0].args[0]).toMatchObject({ result: 'Aborted', reason: 'Aborted' });
    expect(gameStore.state.get('game-1')).toMatchObject({ status: 'completed', result: 'aborted' });
    expect(gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ status: 'aborted', winner_id: null });
    expect(rating.processGameEnd).not.toHaveBeenCalled();
});
