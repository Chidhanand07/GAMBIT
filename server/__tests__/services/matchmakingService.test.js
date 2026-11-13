/**
 * src/services/matchmakingService.js with injected time, randomness and ports.
 */
const { createMatchmakingService } = require('../../src/services/matchmakingService');
const { fakeEmitter, fakeGameStore, result } = require('./fakes');
const { fakeMatchmakingQueue } = require('./fakeMatchmakingQueue');
const { log } = require('../../src/observability/log');

const T = 5_000_000;

function setup({ profiles = {}, random = 0.9, queue = fakeMatchmakingQueue(), instanceId = 'inst-1' } = {}) {
    const emitter = fakeEmitter();
    const gameStore = fakeGameStore();
    const gamesRepo = { insertReturning: jest.fn((row) => result({ id: 'g1', ...row })) };
    const profilesRepo = { findForMatchmaking: jest.fn((id) => result(profiles[id] ?? null)) };
    const svc = createMatchmakingService({
        gamesRepo,
        profilesRepo,
        gameStore,
        emitter,
        queue,
        instanceId,
        now: () => T,
        random: () => random,
    });
    return { svc, emitter, gameStore, gamesRepo, profilesRepo, queue };
}

const profile = (id, rating_rapid, games_played = 30) => ({ id, username: id, rating_rapid, games_played });

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('requestMatch queues with the DB rating for the time control, never the client one', async () => {
    const { svc, emitter } = setup({ profiles: { a: profile('a', 1700) } });
    await svc.requestMatch({ user: { id: 'a', rating: 3000 }, time_control: '10', increment: 0 }, 'sa');
    expect(await svc.queuedEntry('a')).toMatchObject({ rating: 1700, joined_at: T, isRated: true, socketId: 'sa' });
    expect(emitter.sent).toEqual([{ room: 'sa', event: 'queue_joined', args: [{ position: 1, estimated_wait: 10 }] }]);
});

test('requestMatch ignores payloads without a user id and unknown users', async () => {
    const { svc, profilesRepo } = setup();
    await svc.requestMatch(undefined, 's');
    expect(profilesRepo.findForMatchmaking).not.toHaveBeenCalled();
    await svc.requestMatch({ user: { id: 'ghost' } }, 's');
    expect(await svc.queueSize()).toBe(0);
});

test('leaveQueueBySocket drops only that socket', async () => {
    const { svc } = setup();
    await svc.joinQueue({ user: { id: 'a', username: 'a' }, socketId: 's1', timeControl: '10', increment: 0 });
    await svc.joinQueue({ user: { id: 'b', username: 'b' }, socketId: 's2', timeControl: '10', increment: 0 });
    await svc.leaveQueueBySocket('s1');
    expect(await svc.queuedUserIds()).toEqual(['b']);
});

test('matchPlayers pairs, seeds Redis, notifies both sockets and broadcasts the queue size', async () => {
    const { svc, emitter, gameStore, gamesRepo } = setup({ random: 0.9 });
    await svc.joinQueue({
        user: { id: 'a', username: 'a', rating: 1500, games_played: 50 },
        socketId: 'sa',
        timeControl: '5+3',
        increment: 3,
    });
    await svc.joinQueue({
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
    await svc.joinQueue({ user: { id: 'a', username: 'a' }, socketId: 'sa', timeControl: '10', increment: 0 });
    await svc.joinQueue({ user: { id: 'b', username: 'b' }, socketId: 'sb', timeControl: '10', increment: 0 });
    await svc.matchPlayers();
    expect(log.error).toHaveBeenCalledWith('[matchmaking] createGame error:', 'insert failed');
    expect(await svc.queueSize()).toBe(0);
    expect(emitter.named('match_found')).toHaveLength(0);
});

describe('time controls are canonical in the queue and in the game [TIME-CONTROL, G4]', () => {
    const queued = { a: profile('a', 1500), b: profile('b', 1500) };

    test('a bare "5" with a separate increment of 3 is queued as 5+3', async () => {
        const { svc } = setup({ profiles: queued });
        await svc.requestMatch({ user: { id: 'a' }, time_control: '5', increment: 3 }, 'sa');
        expect(await svc.queuedEntry('a')).toMatchObject({ time_control: '5+3', increment: 3 });
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
        expect(await svc.queueSize()).toBe(2);
    });

    test('no time control → the default 10+0; the rating pool follows the canonical value', async () => {
        const { svc } = setup({ profiles: { a: { ...profile('a', 1500), rating_classical: 1900 } } });
        await svc.requestMatch({ user: { id: 'a' } }, 'sa');
        expect(await svc.queuedEntry('a')).toMatchObject({ time_control: '10+0', increment: 0, rating: 1500 });
        await svc.leaveQueue('a');
        await svc.requestMatch({ user: { id: 'a' }, time_control: '30' }, 'sa');
        expect(await svc.queuedEntry('a')).toMatchObject({ time_control: '30+0', rating: 1900 });
    });

    test('an invalid time control is refused with a reason, and nothing is queued', async () => {
        const { svc, profilesRepo } = setup({ profiles: queued });
        expect(await svc.requestMatch({ user: { id: 'a' }, time_control: '-5' }, 'sa')).toEqual({
            ok: false,
            error: 'invalid_time_control',
        });
        expect(await svc.queueSize()).toBe(0);
        expect(profilesRepo.findForMatchmaking).not.toHaveBeenCalled();
    });
});

describe('match_found is a minimal DTO; a failed game insert is reported [G12]', () => {
    const queueTwo = async (svc) => {
        // An established player inside the 800–1400 band may meet a provisional one.
        await svc.joinQueue({ user: { id: 'a', username: 'alice', rating: 1300, games_played: 50 }, socketId: 'sa', timeControl: '5+3' });
        await svc.joinQueue({ user: { id: 'b', username: 'bob', rating: 1510, games_played: 2 }, socketId: 'sb', timeControl: '5+3' });
    };

    test('the opponent is described by four public fields: no socket id, no queue internals', async () => {
        const { svc, emitter } = setup({ random: 0.9 });
        await queueTwo(svc);
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
        await queueTwo(svc);
        await svc.matchPlayers();
        const payload = emitter.named('match_found')[0].args[0];
        expect(payload).toMatchObject({ id: 'g1', white_id: 'a', black_id: 'b', time_control: '5+3', color: 'white' });
        expect(payload).not.toHaveProperty('invite_token');
        expect(payload).not.toHaveProperty('some_internal_column');
    });

    test('a failed game insert tells both players (match_failed) instead of dropping them silently', async () => {
        const { svc, emitter, gamesRepo, gameStore } = setup();
        gamesRepo.insertReturning.mockReturnValue(result(null, { message: 'insert failed' }));
        await queueTwo(svc);
        await svc.matchPlayers();

        expect(emitter.named('match_found')).toEqual([]);
        expect(emitter.named('match_failed').map((e) => [e.room, e.args[0]])).toEqual([
            ['sa', { reason: 'game_creation_failed' }],
            ['sb', { reason: 'game_creation_failed' }],
        ]);
        // Out of the queue: each client decides whether to search again (no retry storm against a failing DB).
        expect(await svc.queueSize()).toBe(0);
        expect(gameStore.state.size).toBe(0);
        expect(log.error).toHaveBeenCalledWith('[matchmaking] createGame error:', 'insert failed');
    });

    test('an insert that throws is reported the same way and does not stop the pairing pass', async () => {
        const { svc, emitter, gamesRepo } = setup();
        gamesRepo.insertReturning.mockImplementation(() => {
            throw new Error('network down');
        });
        await queueTwo(svc);
        await expect(svc.matchPlayers()).resolves.toBeUndefined();
        expect(emitter.named('match_failed')).toHaveLength(2);
        expect(emitter.named('queue_status')).toHaveLength(1);
    });
});

describe('shared queue across instances [MULTI-INSTANCE, NODE-17]', () => {
    const join = (svc, id, socketId = `s-${id}`, rating = 1500) =>
        svc.joinQueue({ user: { id, username: id, rating, games_played: 50 }, socketId, timeControl: '10', increment: 0 });

    test('a pair is created only after the queue claim: a player gone in between means no game', async () => {
        const { svc, queue, gamesRepo, emitter } = setup();
        await join(svc, 'a');
        await join(svc, 'b');
        const [a, b] = await queue.list();
        await svc.leaveQueue('b');
        await svc.createGame(a, b);
        expect(gamesRepo.insertReturning).not.toHaveBeenCalled();
        expect(emitter.named('match_found')).toEqual([]);
        expect(await svc.queuedUserIds()).toEqual(['a']);
    });

    test('players queued on two instances are paired by whichever instance holds the lock', async () => {
        const queue = fakeMatchmakingQueue();
        const one = setup({ queue, instanceId: 'one' });
        const two = setup({ queue, instanceId: 'two' });
        await join(one.svc, 'a');
        await join(two.svc, 'b');
        await Promise.all([one.svc.matchPlayers(), two.svc.matchPlayers()]);
        const inserts = [...one.gamesRepo.insertReturning.mock.calls, ...two.gamesRepo.insertReturning.mock.calls];
        expect(inserts).toHaveLength(1);
        expect(await queue.size()).toBe(0);
    });

    test('only the instance that paired broadcasts queue_status; the other keeps a size snapshot', async () => {
        const queue = fakeMatchmakingQueue();
        const one = setup({ queue, instanceId: 'one' });
        const two = setup({ queue, instanceId: 'two' });
        await join(one.svc, 'a');
        await queue.acquirePairingLock('someone-else', 60_000);
        await one.svc.matchPlayers();
        expect(one.emitter.named('queue_status')).toEqual([]);
        expect(one.svc.searchingCount()).toBe(1);
        await queue.releasePairingLock('someone-else');
        await two.svc.matchPlayers();
        expect(two.emitter.named('queue_status')).toHaveLength(1);
    });

    test('the pairing lock is released even when the pass throws', async () => {
        const { svc, queue, gameStore } = setup();
        gameStore.setGame = jest.fn(async () => {
            throw new Error('redis down');
        });
        await join(svc, 'a');
        await join(svc, 'b');
        await expect(svc.matchPlayers()).rejects.toThrow('redis down');
        expect(await queue.acquirePairingLock('next', 1000)).toBe(true);
    });

    test('each pass refreshes the entries this instance queued, so they outlive the TTL', async () => {
        let clock = 0;
        const queue = fakeMatchmakingQueue({ entryTtlMs: 1000, clock: () => clock });
        const { svc } = setup({ queue });
        await join(svc, 'a');
        for (clock = 900; clock < 5000; clock += 900) await svc.matchPlayers();
        expect(await svc.queuedUserIds()).toEqual(['a']);
    });

    test("an instance that stops refreshing (crashed) leaves no ghost: its entries expire", async () => {
        let clock = 0;
        const queue = fakeMatchmakingQueue({ entryTtlMs: 1000, clock: () => clock });
        const crashed = setup({ queue, instanceId: 'crashed' });
        const alive = setup({ queue, instanceId: 'alive' });
        await join(crashed.svc, 'ghost');
        clock = 1500;
        await join(alive.svc, 'b');
        await alive.svc.matchPlayers();
        expect(alive.gamesRepo.insertReturning).not.toHaveBeenCalled();
        expect(await alive.svc.queuedUserIds()).toEqual(['b']);
    });

    test('disconnect on one instance does not remove an entry the user re-made from another socket', async () => {
        const queue = fakeMatchmakingQueue();
        const one = setup({ queue, instanceId: 'one' });
        const two = setup({ queue, instanceId: 'two' });
        await join(one.svc, 'a', 'old-socket');
        await one.svc.leaveQueue('a');
        await join(two.svc, 'a', 'new-socket');
        await one.svc.leaveQueueBySocket('old-socket');
        expect(await two.svc.queuedEntry('a')).toMatchObject({ socketId: 'new-socket' });
    });

    test('leaveQueue and leaveQueueBySocket never reject: a queue failure is logged', async () => {
        const queue = fakeMatchmakingQueue();
        const { svc } = setup({ queue });
        await join(svc, 'a', 'sa');
        queue.remove = jest.fn(async () => {
            throw new Error('redis down');
        });
        await expect(svc.leaveQueue('a')).resolves.toBeUndefined();
        await join(svc, 'b', 'sb');
        await expect(svc.leaveQueueBySocket('sb')).resolves.toBeUndefined();
        expect(log.error).toHaveBeenCalledWith('[matchmaking] leaveQueue failed:', 'redis down');
        expect(log.error).toHaveBeenCalledWith('[matchmaking] leaveQueueBySocket failed:', 'redis down');
    });
});
