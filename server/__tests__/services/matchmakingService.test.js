/**
 * src/services/matchmakingService.js with injected time, randomness and ports.
 */
const { createMatchmakingService } = require('../../src/services/matchmakingService');
const { fakeEmitter, fakeGameStore, result } = require('./fakes');

const T = 5_000_000;

function setup({ profiles = {}, random = 0.9 } = {}) {
    const emitter = fakeEmitter();
    const gameStore = fakeGameStore();
    const gamesRepo = { insertReturning: jest.fn((row) => result({ id: 'g1', ...row })) };
    const profilesRepo = { findForMatchmaking: jest.fn((id) => result(profiles[id] ?? null)) };
    const svc = createMatchmakingService({
        gamesRepo,
        profilesRepo,
        gameStore,
        emitter,
        now: () => T,
        random: () => random,
    });
    return { svc, emitter, gameStore, gamesRepo, profilesRepo };
}

const profile = (id, rating_rapid, games_played = 30) => ({ id, username: id, rating_rapid, games_played });

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('requestMatch queues with the DB rating for the time control, never the client one', async () => {
    const { svc, emitter } = setup({ profiles: { a: profile('a', 1700) } });
    await svc.requestMatch({ user: { id: 'a', rating: 3000 }, time_control: '10', increment: 0 }, 'sa');
    expect(svc.queue.get('a')).toMatchObject({ rating: 1700, joined_at: T, isRated: true, socketId: 'sa' });
    expect(emitter.sent).toEqual([{ room: 'sa', event: 'queue_joined', args: [{ position: 1, estimated_wait: 10 }] }]);
});

test('requestMatch ignores payloads without a user id and unknown users', async () => {
    const { svc, profilesRepo } = setup();
    await svc.requestMatch(undefined, 's');
    expect(profilesRepo.findForMatchmaking).not.toHaveBeenCalled();
    await svc.requestMatch({ user: { id: 'ghost' } }, 's');
    expect(svc.queue.size).toBe(0);
});

test('leaveQueueBySocket drops only that socket', () => {
    const { svc } = setup();
    svc.joinQueue({ user: { id: 'a', username: 'a' }, socketId: 's1', timeControl: '10', increment: 0 });
    svc.joinQueue({ user: { id: 'b', username: 'b' }, socketId: 's2', timeControl: '10', increment: 0 });
    svc.leaveQueueBySocket('s1');
    expect([...svc.queue.keys()]).toEqual(['b']);
});

test('matchPlayers pairs, seeds Redis, notifies both sockets and broadcasts the queue size', async () => {
    const { svc, emitter, gameStore, gamesRepo } = setup({ random: 0.9 });
    svc.joinQueue({
        user: { id: 'a', username: 'a', rating: 1500, games_played: 50 },
        socketId: 'sa',
        timeControl: '5+3',
        increment: 3,
    });
    svc.joinQueue({
        user: { id: 'b', username: 'b', rating: 1510, games_played: 50 },
        socketId: 'sb',
        timeControl: '5+3',
        increment: 3,
    });

    await svc.matchPlayers();

    expect(gamesRepo.insertReturning.mock.calls[0][0]).toMatchObject({
        white_id: 'a',
        black_id: 'b',
        increment: 3,
        status: 'active',
    });
    expect(gameStore.state.get('g1')).toMatchObject({ whiteId: 'a', blackId: 'b', incrementMs: 3000, isRated: true });
    expect(gameStore.active.has('g1')).toBe(true);
    expect(emitter.named('match_found').map((e) => [e.room, e.args[0].color])).toEqual([
        ['sa', 'white'],
        ['sb', 'black'],
    ]);
    expect(emitter.sent.at(-1)).toEqual({ room: '*', event: 'queue_status', args: [{ players_searching: 0 }] });
});

test('a failed insert logs and drops both players (pinned)', async () => {
    const { svc, gamesRepo, emitter } = setup();
    gamesRepo.insertReturning.mockReturnValue(result(null, { message: 'insert failed' }));
    svc.joinQueue({ user: { id: 'a', username: 'a' }, socketId: 'sa', timeControl: '10', increment: 0 });
    svc.joinQueue({ user: { id: 'b', username: 'b' }, socketId: 'sb', timeControl: '10', increment: 0 });
    await svc.matchPlayers();
    expect(console.error).toHaveBeenCalledWith('[matchmaking] createGame error:', 'insert failed');
    expect(svc.queue.size).toBe(0);
    expect(emitter.named('match_found')).toHaveLength(0);
});
