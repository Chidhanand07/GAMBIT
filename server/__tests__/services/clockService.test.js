/**
 * src/services/clockService.js with injected time and in-memory ports.
 */
const { createClockService } = require('../../src/services/clockService');
const { fakeEmitter, fakeGameStore, result } = require('./fakes');
const { makeGame } = require('../helpers/fixtures');

const T = 1_000_000;

function setup(game, { finished = true } = {}) {
    const gameStore = fakeGameStore({ [game.id]: game });
    gameStore.active.add(game.id);
    const emitter = fakeEmitter();
    const rating = { processGameEnd: jest.fn(async () => ({ white: { change: 5 } })) };
    const gamesRepo = { finishIfActive: jest.fn(() => result(finished ? { id: game.id } : null)) };
    let now = T;
    const svc = createClockService({ gameStore, gamesRepo, getRatingService: () => rating, emitter, now: () => now });
    return { svc, gameStore, emitter, rating, gamesRepo, advance: (ms) => (now += ms) };
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

test('flag fall: completes in Redis, leaves the active set, broadcasts Time, finalizes and rates', async () => {
    const { svc, emitter, gameStore, rating, gamesRepo } = setup(
        makeGame({ lastMoveAt: T - 5000, blackClockMs: 4000, activeSide: 'b' }),
    );
    await svc.tick();

    expect(gameStore.state.get('game-1')).toMatchObject({ status: 'completed', result: 'white' });
    expect(gameStore.active.size).toBe(0);
    expect(emitter.named('game_end')[0].args[0]).toEqual({
        game_id: 'game-1',
        result: 'White wins',
        reason: 'Time',
        white_id: 'white-user',
        black_id: 'black-user',
        is_rated: true,
        time_control: '10',
    });
    expect(gamesRepo.finishIfActive.mock.calls[0][1]).toMatchObject({ status: 'completed', winner_id: 'white-user' });
    expect(rating.processGameEnd).toHaveBeenCalledWith('game-1', 'white-user', 'black-user', 'white', '10', true);
    expect(emitter.named('rating_updated')).toHaveLength(1);
});

test('abandonment after the grace period; paused before it', async () => {
    const info = { userId: 'white-user', side: 'white', at: T };
    const { svc, emitter, advance } = setup(
        makeGame({ lastMoveAt: T - 999999, whiteClockMs: 1, disconnectInfo: info }),
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
});

test('finalizeExpiredGame: already finalized → no rating; rating errors are logged', async () => {
    const { svc, rating } = setup(makeGame(), { finished: false });
    await svc.finalizeExpiredGame({ gameId: 'game-1', game: makeGame(), winnerId: 'white-user' });
    expect(rating.processGameEnd).not.toHaveBeenCalled();

    const other = setup(makeGame());
    other.rating.processGameEnd.mockRejectedValue(new Error('boom'));
    await other.svc.finalizeExpiredGame({ gameId: 'game-1', game: makeGame(), winnerId: 'white-user' });
    expect(console.error).toHaveBeenCalledWith('[clock] rating error:', 'boom');
});

test('a ticker-level failure is logged', async () => {
    const { svc, gameStore } = setup(makeGame());
    gameStore.getActiveGameIds.mockRejectedValue(new Error('redis down'));
    await svc.tick();
    expect(console.error).toHaveBeenCalledWith('[clock] ticker error:', 'redis down');
});
