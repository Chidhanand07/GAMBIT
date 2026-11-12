/**
 * server/services/clock.js — the single global ticker that syncs clocks,
 * flags players on time, and ends games after a 20 s disconnect.
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());
jest.mock('../services/rating', () => ({ processGameEnd: jest.fn() }));

const { supabase } = require('../supabase');
const redis = require('../lib/redis');
const rating = require('../services/rating');
const gameStore = require('../lib/gameStore');
const { setGame, getGame, addActiveGame, getActiveGameIds } = gameStore;
const clock = require('../services/clock');
const { createGamesRepository } = require('../src/repositories/gamesRepository');
const { createClockService } = require('../src/services/clockService');
const { createIoEmitter } = require('../src/services/emitter');
const { createGameFinalizer } = require('../src/services/gameFinalizer');
const { createSessionRegistry } = require('../src/sockets/sessionRegistry');
const { makeGame, makeIo } = require('./helpers/fixtures');

const NOW = new Date('2026-01-01T12:00:00Z').getTime();

let io;
beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    supabase.reset();
    redis._reset();
    rating.processGameEnd.mockReset().mockResolvedValue(null);
    review.triggerGameReview.mockReset();
    io = makeIo();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    clock.stopGlobalClock();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

const review = { triggerGameReview: jest.fn() };

/** The clock service as the composition root builds it: it ends games through the finalizer [G3]. */
function clockService() {
    const emitter = createIoEmitter(io);
    const finalizer = createGameFinalizer({
        gameStore,
        gamesRepo: createGamesRepository(supabase),
        ratingService: rating,
        reviewService: review,
        sessions: createSessionRegistry(),
        emitter,
    });
    return createClockService({ gameStore, finalizer, emitter });
}

async function startWith(game) {
    await setGame(game.id, game);
    await addActiveGame(game.id);
    clock.startGlobalClock(clockService());
}

describe('parseIncrement', () => {
    test.each([
        ['10', 0], ['5+3', 3000], ['3+2', 2000], ['1+0', 0],
        // A 0-minute base is not a time control: the stored value falls back to 10+0.
        ['0+30', 0],
        ['', 0], [undefined, 0], [null, 0], ['5+x', 0], [10, 0],
    ])('%p → %p ms', (tc, ms) => expect(clock.parseIncrement(tc)).toBe(ms));
});

describe('global ticker', () => {
    test('emits clock_sync every second with the running clock counted down', async () => {
        await startWith(makeGame({ lastMoveAt: NOW, whiteClockMs: 60000, blackClockMs: 50000 }));

        await jest.advanceTimersByTimeAsync(3000);

        const syncs = io.eventsNamed('clock_sync');
        expect(syncs).toHaveLength(3);
        expect(syncs[2]).toMatchObject({ room: 'game_game-1', payload: { whiteMs: 57000, blackMs: 50000 } });
    });

    test('does not tick a game before the first move (lastMoveAt null)', async () => {
        await startWith(makeGame({ lastMoveAt: null }));
        await jest.advanceTimersByTimeAsync(5000);
        expect(io.emitted).toHaveLength(0);
    });

    test('ignores completed games still in the active set', async () => {
        await startWith(makeGame({ status: 'completed', lastMoveAt: NOW }));
        await jest.advanceTimersByTimeAsync(2000);
        expect(io.emitted).toHaveLength(0);
    });

    test('starting twice does not create a second ticker', async () => {
        await startWith(makeGame({ lastMoveAt: NOW }));
        clock.startGlobalClock(io);
        await jest.advanceTimersByTimeAsync(1000);
        expect(io.eventsNamed('clock_sync')).toHaveLength(1);
    });

    test('flags white on time: black wins, game finalized and rated once', async () => {
        await startWith(makeGame({ lastMoveAt: NOW, whiteClockMs: 2500, activeSide: 'w' }));
        supabase.queue('games', { data: { id: 'game-1' }, error: null });
        rating.processGameEnd.mockResolvedValue({ white: { change: -8 }, black: { change: 8 } });

        await jest.advanceTimersByTimeAsync(3000);

        const ends = io.eventsNamed('game_end');
        expect(ends).toHaveLength(1);
        expect(ends[0].payload).toMatchObject({ result: 'Black wins', reason: 'Time', white_id: 'white-user', black_id: 'black-user' });

        const state = await getGame('game-1');
        expect(state).toMatchObject({ status: 'completed', result: 'black' });
        expect(await getActiveGameIds()).not.toContain('game-1');

        const update = supabase.callsFor('games')[0];
        expect(supabase.op(update, 'update')[0]).toMatchObject({ status: 'completed', winner_id: 'black-user' });
        expect(update.ops).toContainEqual(['eq', 'status', 'active']);

        expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'black', '10', true);
        expect(io.eventsNamed('rating_updated')).toHaveLength(1);

        // Further ticks do nothing: the game left the active set.
        await jest.advanceTimersByTimeAsync(3000);
        expect(io.eventsNamed('game_end')).toHaveLength(1);
    });

    test('flags black on time: white wins', async () => {
        await startWith(makeGame({ lastMoveAt: NOW, blackClockMs: 1000, activeSide: 'b' }));
        await jest.advanceTimersByTimeAsync(1000);
        expect(io.eventsNamed('game_end')[0].payload.result).toBe('White wins');
    });

    test('pauses the clock while a player is disconnected', async () => {
        await startWith(makeGame({
            lastMoveAt: NOW - 50000, whiteClockMs: 10000, activeSide: 'w',
            disconnectInfo: { userId: 'black-user', side: 'black', at: NOW },
        }));
        await jest.advanceTimersByTimeAsync(5000);
        // White's clock would be long gone, but nothing ends while the opponent is away < 20 s.
        expect(io.eventsNamed('game_end')).toHaveLength(0);
    });

    test('ends the game by abandonment after 20 s disconnected', async () => {
        await startWith(makeGame({
            lastMoveAt: NOW,
            // A game that is underway (one move each); before that a disconnect aborts it [G10].
            moveLog: [{ move: 'e2e4', fen: 'x', san: 'e4' }, { move: 'e7e5', fen: 'y', san: 'e5' }],
            disconnectInfo: { userId: 'white-user', side: 'white', at: NOW },
        }));
        supabase.queue('games', { data: { id: 'game-1' }, error: null });

        await jest.advanceTimersByTimeAsync(19000);
        expect(io.eventsNamed('game_end')).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(1000);
        const ends = io.eventsNamed('game_end');
        expect(ends).toHaveLength(1);
        expect(ends[0].payload).toMatchObject({ result: 'Black wins', reason: 'Abandonment' });
        expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'black', '10', true);
    });

    test('one broken game does not stop other games ticking', async () => {
        await redis.set('game:broken', '{oops');
        await addActiveGame('broken');
        await startWith(makeGame({ lastMoveAt: NOW }));
        await jest.advanceTimersByTimeAsync(1000);
        expect(io.eventsNamed('clock_sync')).toHaveLength(1);
    });
});

describe('finalization of a game the clock ended [G3]', () => {
    const flagged = () => makeGame({ lastMoveAt: NOW, whiteClockMs: 500, activeSide: 'w' });

    test('does not rate or review a game that was already finalized elsewhere', async () => {
        await startWith(flagged());
        supabase.queue('games', { data: null, error: null });
        await jest.advanceTimersByTimeAsync(1000);
        expect(io.eventsNamed('game_end')).toHaveLength(1);
        expect(rating.processGameEnd).not.toHaveBeenCalled();
        expect(review.triggerGameReview).not.toHaveBeenCalled();
    });

    test('a rating failure is logged, not thrown: the ticker keeps running', async () => {
        await startWith(flagged());
        supabase.queue('games', { data: { id: 'game-1' }, error: null });
        rating.processGameEnd.mockRejectedValue(new Error('rating down'));
        await jest.advanceTimersByTimeAsync(1000);
        expect(console.error).toHaveBeenCalledWith('[clock] game game-1 error:', 'rating down');
        expect(io.eventsNamed('game_end')).toHaveLength(1);
    });

    test('the legacy second finalization path is gone', () => {
        expect(clock.finalizeExpiredGame).toBeUndefined();
    });
});
