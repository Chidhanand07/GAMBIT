/**
 * Two server instances, one shared queue (TEST-06, NODE-17) [MULTI-INSTANCE].
 *
 * Two matchmaking services — each with its own instance id, its own Redis
 * connection (real Redis when available, else one shared mock) and its own
 * emitter — queue players and run their pairing passes concurrently, many
 * times. Every player must end up in at most one game, and every compatible
 * pair must be matched. A second run removes the leader lock entirely
 * (every pass believes it leads) to show that the atomic claim alone keeps
 * players from being paired twice.
 */
const { createMatchmakingService } = require('../src/services/matchmakingService');
const { createMatchmakingQueueRepository } = require('../src/repositories/matchmakingQueueRepository');
const { createRedisMock } = require('./helpers/mockRedis');
const { fakeEmitter, fakeGameStore } = require('./services/fakes');
const realRedis = require('./helpers/realRedis');

const TIME_CONTROLS = ['1+0', '3+2', '10+0'];
const PLAYERS = 31; // 11 / 10 / 10 per time control: one 1+0 player is left waiting
const ROUNDS = 15;

let real = null;
if (realRedis.available) {
    beforeAll(async () => {
        real = await realRedis.startRealRedis();
    });
    afterAll(async () => {
        await real?.stop();
    });
} else {
    test.skip(`two instances on real Redis — ${realRedis.SKIP_REASON}`, () => {});
}

const randomDelay = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)));

/** One "server instance": its own service, emitter and (for real Redis) connection. */
function instance(name, { redis, namespace, games, withoutLock }) {
    const repo = createMatchmakingQueueRepository(redis, { namespace });
    const queue = withoutLock ? { ...repo, acquirePairingLock: async () => true } : repo;
    const emitter = fakeEmitter();
    const gamesRepo = {
        async insertReturning(row) {
            await randomDelay(); // a slow database widens every race window
            const id = `g${games.length + 1}`;
            games.push({ id, ...row, by: name });
            return { data: { id, ...row }, error: null };
        },
    };
    const svc = createMatchmakingService({
        gamesRepo,
        profilesRepo: { findForMatchmaking: async () => ({ data: null }) },
        gameStore: fakeGameStore(),
        emitter,
        queue,
        instanceId: name,
        lockTtlMs: 2, // expires mid-pass: passes on the two instances overlap
    });
    return { svc, emitter };
}

const backends = [['shared Redis mock', () => ({ a: createRedisMock(), shared: true })]];
if (realRedis.available) backends.push(['real Redis, two connections', () => ({ a: real.client(), b: real.client() })]);

describe.each(backends)('two instances over %s', (_name, connect) => {
    test.each([
        ['with the pairing lock', false],
        ['with NO lock at all (every pass thinks it leads)', true],
    ])('%s: nobody is paired twice and every compatible pair is matched', async (_label, withoutLock) => {
        const conns = connect();
        const namespace = realRedis.uniqueNamespace('mm2');
        const games = [];
        const one = instance('one', { redis: conns.a, namespace, games, withoutLock });
        const two = instance('two', { redis: conns.b ?? conns.a, namespace, games, withoutLock });
        const players = Array.from({ length: PLAYERS }, (_, i) => ({
            id: `u${i}`,
            timeControl: TIME_CONTROLS[i % TIME_CONTROLS.length],
            via: i % 2 ? one : two,
        }));

        // Joins land on both instances while both pairing loops are already running.
        const joining = players.map(async (p, i) => {
            await new Promise((r) => setTimeout(r, i % 7));
            await p.via.svc.joinQueue({
                user: { id: p.id, username: p.id, rating: 1500, games_played: 50 },
                socketId: `sock-${p.id}`,
                timeControl: p.timeControl,
                increment: Number(p.timeControl.split('+')[1]),
            });
        });
        const pairing = (async () => {
            for (let r = 0; r < ROUNDS; r++) {
                await Promise.all([one.svc.matchPlayers(), two.svc.matchPlayers(), one.svc.matchPlayers(), two.svc.matchPlayers()]);
            }
        })();
        await Promise.all([...joining, pairing]);
        for (let r = 0; r < 3; r++) await Promise.all([one.svc.matchPlayers(), two.svc.matchPlayers()]);

        // At most one game per player.
        const seated = games.flatMap((g) => [g.white_id, g.black_id]);
        expect(new Set(seated).size).toBe(seated.length);
        // Each game is between players of the same time control.
        const tcOf = Object.fromEntries(players.map((p) => [p.id, p.timeControl]));
        for (const g of games) expect([tcOf[g.white_id], tcOf[g.black_id], g.time_control]).toEqual([g.time_control, g.time_control, g.time_control]);
        // Everyone compatible was matched: per time control, at most one player is still waiting.
        const waiting = await one.svc.queuedUserIds();
        for (const tc of TIME_CONTROLS) expect(waiting.filter((id) => tcOf[id] === tc).length).toBeLessThanOrEqual(1);
        expect(seated.length + waiting.length).toBe(PLAYERS);
        // Each socket heard match_found at most once, from either instance.
        const found = [...one.emitter.named('match_found'), ...two.emitter.named('match_found')].map((e) => e.room);
        expect(new Set(found).size).toBe(found.length);
        expect(found).toHaveLength(seated.length);
    }, 20_000);
});
