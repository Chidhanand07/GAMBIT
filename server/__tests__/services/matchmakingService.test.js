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

describe('time controls are canonical in the queue and in the game [TIME-CONTROL, G4]', () => {
    const queued = { a: profile('a', 1500), b: profile('b', 1500) };

    test('a bare "5" with a separate increment of 3 is queued as 5+3', async () => {
        const { svc } = setup({ profiles: queued });
        await svc.requestMatch({ user: { id: 'a' }, time_control: '5', increment: 3 }, 'sa');
        expect(svc.queue.get('a')).toMatchObject({ time_control: '5+3', increment: 3 });
    });

    test('the increment is not lost: the game row and the clock state both carry it', async () => {
        const { svc, gameStore, gamesRepo } = setup({ profiles: queued });
        await svc.requestMatch({ user: { id: 'a' }, time_control: '5', increment: 3 }, 'sa');
        await svc.requestMatch({ user: { id: 'b' }, time_control: '5+3' }, 'sb');
        await svc.matchPlayers();
        expect(gamesRepo.insertReturning.mock.calls[0][0]).toMatchObject({ time_control: '5+3', increment: 3 });
        expect(gameStore.state.get('g1')).toMatchObject({ timeControl: '5+3', incrementMs: 3000, whiteClockMs: 300000 });
    });

    test('players who chose different increments are not paired', async () => {
        const { svc, gamesRepo } = setup({ profiles: queued });
        await svc.requestMatch({ user: { id: 'a' }, time_control: '5', increment: 0 }, 'sa');
        await svc.requestMatch({ user: { id: 'b' }, time_control: '5', increment: 3 }, 'sb');
        await svc.matchPlayers();
        expect(gamesRepo.insertReturning).not.toHaveBeenCalled();
        expect(svc.queue.size).toBe(2);
    });

    test('no time control → the default 10+0; the rating pool follows the canonical value', async () => {
        const { svc } = setup({ profiles: { a: { ...profile('a', 1500), rating_classical: 1900 } } });
        await svc.requestMatch({ user: { id: 'a' } }, 'sa');
        expect(svc.queue.get('a')).toMatchObject({ time_control: '10+0', increment: 0, rating: 1500 });
        svc.leaveQueue('a');
        await svc.requestMatch({ user: { id: 'a' }, time_control: '30' }, 'sa');
        expect(svc.queue.get('a')).toMatchObject({ time_control: '30+0', rating: 1900 });
    });

    test('an invalid time control is refused with a reason, and nothing is queued', async () => {
        const { svc, profilesRepo } = setup({ profiles: queued });
        expect(await svc.requestMatch({ user: { id: 'a' }, time_control: '-5' }, 'sa')).toEqual({
            ok: false,
            error: 'invalid_time_control',
        });
        expect(svc.queue.size).toBe(0);
        expect(profilesRepo.findForMatchmaking).not.toHaveBeenCalled();
    });
});

describe('match_found is a minimal DTO; a failed game insert is reported [G12]', () => {
    const queueTwo = (svc) => {
        // An established player inside the 800–1400 band may meet a provisional one.
        svc.joinQueue({ user: { id: 'a', username: 'alice', rating: 1300, games_played: 50 }, socketId: 'sa', timeControl: '5+3' });
        svc.joinQueue({ user: { id: 'b', username: 'bob', rating: 1510, games_played: 2 }, socketId: 'sb', timeControl: '5+3' });
    };

    test('the opponent is described by four public fields: no socket id, no queue internals', async () => {
        const { svc, emitter } = setup({ random: 0.9 });
        queueTwo(svc);
        await svc.matchPlayers();

        const [toWhite, toBlack] = emitter.named('match_found').map((e) => e.args[0]);
        expect(toWhite.opponent).toEqual({ user_id: 'b', username: 'bob', rating: 1510, isProvisional: true });
        expect(toBlack.opponent).toEqual({ user_id: 'a', username: 'alice', rating: 1300, isProvisional: false });
        expect(JSON.stringify([toWhite, toBlack])).not.toMatch(/socketId|joined_at|"sa"|"sb"/);
    });

    test('the game part of match_found is the public view of the row', async () => {
        const { svc, emitter, gamesRepo } = setup({ random: 0.9 });
        gamesRepo.insertReturning.mockImplementation((row) =>
            result({ id: 'g1', ...row, invite_token: 'SECRET', some_internal_column: 'x' }),
        );
        queueTwo(svc);
        await svc.matchPlayers();
        const payload = emitter.named('match_found')[0].args[0];
        expect(payload).toMatchObject({ id: 'g1', white_id: 'a', black_id: 'b', time_control: '5+3', color: 'white' });
        expect(payload).not.toHaveProperty('invite_token');
        expect(payload).not.toHaveProperty('some_internal_column');
    });

    test('a failed game insert tells both players (match_failed) instead of dropping them silently', async () => {
        const { svc, emitter, gamesRepo, gameStore } = setup();
        gamesRepo.insertReturning.mockReturnValue(result(null, { message: 'insert failed' }));
        queueTwo(svc);
        await svc.matchPlayers();

        expect(emitter.named('match_found')).toEqual([]);
        expect(emitter.named('match_failed').map((e) => [e.room, e.args[0]])).toEqual([
            ['sa', { reason: 'game_creation_failed' }],
            ['sb', { reason: 'game_creation_failed' }],
        ]);
        // Out of the queue: each client decides whether to search again (no retry storm against a failing DB).
        expect(svc.queue.size).toBe(0);
        expect(gameStore.state.size).toBe(0);
        expect(console.error).toHaveBeenCalledWith('[matchmaking] createGame error:', 'insert failed');
    });

    test('an insert that throws is reported the same way and does not stop the pairing pass', async () => {
        const { svc, emitter, gamesRepo } = setup();
        gamesRepo.insertReturning.mockImplementation(() => {
            throw new Error('network down');
        });
        queueTwo(svc);
        await expect(svc.matchPlayers()).resolves.toBeUndefined();
        expect(emitter.named('match_failed')).toHaveLength(2);
        expect(emitter.named('queue_status')).toHaveLength(1);
    });
});
