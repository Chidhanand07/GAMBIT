/**
 * src/services/spectatorService.js on the Redis mock with injected time [F-130].
 * Two services over one store stand for two server instances.
 */
const { createRedisMock } = require('../helpers/mockRedis');
const { createSpectatorsRepository } = require('../../src/repositories/spectatorsRepository');
const { createSpectatorService } = require('../../src/services/spectatorService');
const { SPECTATOR_TTL_MS } = require('../../src/domain/spectators');
const { fakeEmitter } = require('./fakes');

const T0 = 1_767_268_800_000;

function setup() {
    const redis = createRedisMock();
    let now = T0;
    const clock = () => now;
    const make = () => {
        const emitter = fakeEmitter();
        const repo = createSpectatorsRepository(redis, { ttlMs: SPECTATOR_TTL_MS });
        return { emitter, svc: createSpectatorService({ repo, emitter, now: clock }) };
    };
    return { a: make(), b: make(), advance: (ms) => (now += ms) };
}

const counts = (emitter) => emitter.named('spectators_changed').map((e) => [e.room, e.args[0]]);

test('a watcher on each instance: both counted, each change announced to the game room', async () => {
    const { a, b } = setup();
    expect(await a.svc.watch('g', 'u1', 's1')).toBe(1);
    expect(await b.svc.watch('g', 'u2', 's2')).toBe(2);
    expect(counts(a.emitter)).toEqual([['game_g', { game_id: 'g', count: 1 }]]);
    expect(counts(b.emitter)).toEqual([['game_g', { game_id: 'g', count: 2 }]]);
    expect(await a.svc.count('g')).toBe(2);
});

test('a second tab of the same viewer is one watcher; a re-join of the same socket is silent', async () => {
    const { a } = setup();
    await a.svc.watch('g', 'u1', 's1');
    expect(await a.svc.watch('g', 'u1', 's2')).toBe(1);
    expect(await a.svc.watch('g', 'u1', 's1')).toBe(1);
    expect(counts(a.emitter)).toHaveLength(2);
});

test('unwatch only affects a socket that was watching; the count drops and is announced', async () => {
    const { a } = setup();
    await a.svc.watch('g', 'u1', 's1');
    await a.svc.watch('g', 'u2', 's2');
    expect(await a.svc.unwatch('g', 'player-socket')).toBe(false);
    expect(await a.svc.unwatch('g', 's1')).toBe(true);
    expect(await a.svc.unwatch('g', 's1')).toBe(false);
    expect(counts(a.emitter).at(-1)).toEqual(['game_g', { game_id: 'g', count: 1 }]);
});

test('a disconnect stops every watch of the socket', async () => {
    const { a } = setup();
    await a.svc.watch('g1', 'u1', 's1');
    await a.svc.watch('g2', 'u1', 's1');
    await a.svc.unwatchAll('s1');
    expect(await a.svc.counts(['g1', 'g2', 'unknown'])).toEqual({ g1: 0, g2: 0, unknown: 0 });
});

test('a crashed instance: its watchers lapse after the TTL; the survivor prunes and announces', async () => {
    const { a, b, advance } = setup();
    await a.svc.watch('g', 'u1', 's1');
    await b.svc.watch('g', 'u2', 's2'); // b then "crashes": it never beats again
    advance(SPECTATOR_TTL_MS / 2);
    await a.svc.heartbeat();
    expect(await a.svc.count('g')).toBe(2);
    advance(SPECTATOR_TTL_MS / 2);
    a.emitter.sent.length = 0;
    await a.svc.heartbeat();
    expect(counts(a.emitter)).toEqual([['game_g', { game_id: 'g', count: 1 }]]);
    expect(await b.svc.count('g')).toBe(1);
});

test('a live watcher pruned during a long pause is put back by its own heartbeat', async () => {
    const { a, b, advance } = setup();
    await a.svc.watch('g', 'u1', 's1');
    advance(SPECTATOR_TTL_MS + 1);
    expect(await b.svc.count('g')).toBe(0); // b prunes the lapsed member
    a.emitter.sent.length = 0;
    await a.svc.heartbeat();
    expect(counts(a.emitter)).toEqual([['game_g', { game_id: 'g', count: 1 }]]);
});

test('start/stop run the heartbeat on an interval', async () => {
    jest.useFakeTimers();
    try {
        const redis = createRedisMock();
        const repo = createSpectatorsRepository(redis, { ttlMs: SPECTATOR_TTL_MS });
        const svc = createSpectatorService({ repo, emitter: fakeEmitter(), heartbeatMs: 1000 });
        const spy = jest.spyOn(repo, 'games');
        svc.start();
        await jest.advanceTimersByTimeAsync(2500);
        expect(spy).toHaveBeenCalledTimes(2);
        svc.stop();
        await jest.advanceTimersByTimeAsync(5000);
        expect(spy).toHaveBeenCalledTimes(2);
    } finally {
        jest.useRealTimers();
    }
});
