/**
 * Draw offers across two game-server instances behind one Redis [DRAW-OFFER][MULTI-INSTANCE]
 * (ADR F-151, TEST-06). White is connected to instance A, Black to instance B. Skipped with a
 * message when no real Redis is available.
 */
const { startRealRedis, uniqueNamespace } = require('../helpers/realRedis');
const { instanceFactory, connectPlayer, once, emitAck, seedGame } = require('../helpers/twoInstances');

const NS = uniqueNamespace('draw-two-instances');
let redisServer;
let startInstance;
const cleanups = [];
const db = { finishCalls: [], moveRows: [] };

beforeAll(async () => {
    redisServer = await startRealRedis();
    if (redisServer)
        startInstance = instanceFactory({ url: redisServer.url, streamName: `${NS}:stream`, cleanups, db });
});
afterAll(async () => {
    for (const fn of cleanups.reverse()) await fn();
    await redisServer?.stop();
});

const maybe = (name, fn) =>
    test(
        name,
        async () => {
            if (!redisServer) {
                console.warn(`skipped (no redis-server binary and no REDIS_TEST_URL): ${name}`);
                return;
            }
            await fn();
        },
        30000,
    );

async function seatedPair(tag) {
    const a = await startInstance(`A-${tag}`);
    const b = await startInstance(`B-${tag}`);
    const id = `${NS}-${tag}`;
    await seedGame(a.gameStore, id);
    const white = await connectPlayer(a.url, 'alice', cleanups);
    const black = await connectPlayer(b.url, 'bob', cleanups);
    await Promise.all([emitAck(white, 'join_game', id), emitAck(black, 'join_game', id)]);
    return { a, b, id, white, black };
}

const move = (socket, id, from, to) => emitAck(socket, 'make_move', { game_id: id, from, to });
const rated = (a, b) =>
    a.ratingService.processGameEnd.mock.calls.length + b.ratingService.processGameEnd.mock.calls.length;

maybe('an offer made on A is seen on B, accepted on B: one game_end on both, rated once', async () => {
    const { a, b, id, white, black } = await seatedPair('accept');
    await move(white, id, 'e2', 'e4');
    await move(black, id, 'e7', 'e5');

    const seen = once(black, 'draw_offered');
    expect(await emitAck(white, 'draw_offer', { game_id: id })).toEqual({ ok: true });
    expect(await seen).toEqual({ game_id: id, by: 'white', ply: 2 });

    const ends = [];
    white.on('game_end', (e) => ends.push(['white', e]));
    black.on('game_end', (e) => ends.push(['black', e]));
    expect(await emitAck(black, 'draw_accept', { game_id: id })).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 400));
    expect(ends.map(([who, e]) => [who, e.result, e.reason])).toEqual(
        expect.arrayContaining([
            ['white', 'Draw', 'Agreement'],
            ['black', 'Draw', 'Agreement'],
        ]),
    );
    expect(ends).toHaveLength(2);
    expect(db.finishCalls.filter((c) => c.id === id)).toHaveLength(1);
    expect(rated(a, b)).toBe(1);
});

maybe('accepting on A while the mating move lands on B: exactly one ending', async () => {
    const { a, b, id, white, black } = await seatedPair('race');
    await move(white, id, 'f2', 'f3');
    await move(black, id, 'e7', 'e5');
    await move(white, id, 'g2', 'g4');
    await emitAck(white, 'draw_offer', { game_id: id });
    const [mate, accept] = await Promise.all([
        move(black, id, 'd8', 'h4'),
        // Black, from a second tab on instance A, accepts White's offer at the same moment.
        connectPlayer(a.url, 'bob', cleanups).then(async (blackOnA) => {
            await emitAck(blackOnA, 'join_game', id);
            return emitAck(blackOnA, 'draw_accept', { game_id: id });
        }),
    ]);
    expect([mate.ok, accept.ok].filter(Boolean)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 400));
    expect(db.finishCalls.filter((c) => c.id === id)).toHaveLength(1);
    expect(rated(a, b)).toBe(1);
    const state = await b.gameStore.getGame(id);
    expect(state.status).toBe('completed');
    expect(['Checkmate', 'Agreement']).toContain(state.reason);
});
