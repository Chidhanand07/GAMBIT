/**
 * Premoves across two game-server instances behind one Redis [PREMOVE][MULTI-INSTANCE]
 * (ADR F-153, TEST-06). White is on instance A, Black on instance B. Skipped with a message
 * when no real Redis is available.
 */
const { startRealRedis, uniqueNamespace } = require('../helpers/realRedis');
const { instanceFactory, connectPlayer, emitAck, seedGame } = require('../helpers/twoInstances');

const NS = uniqueNamespace('premove-two-instances');
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

const move = (socket, id, from, to) => emitAck(socket, 'make_move', { game_id: id, from, to });
const settle = () => new Promise((r) => setTimeout(r, 300));

maybe('a premove queued on B is played the moment the move made on A commits; both players see both', async () => {
    const a = await startInstance('A-pm');
    const b = await startInstance('B-pm');
    const id = `${NS}-play`;
    await seedGame(a.gameStore, id);
    const white = await connectPlayer(a.url, 'alice', cleanups);
    const black = await connectPlayer(b.url, 'bob', cleanups);
    await Promise.all([emitAck(white, 'join_game', id), emitAck(black, 'join_game', id)]);
    const seenByWhite = [];
    const seenByBlack = [];
    white.on('move_made', (m) => seenByWhite.push(m.san));
    black.on('move_made', (m) => seenByBlack.push(m.san));

    expect(await emitAck(black, 'premove_set', { game_id: id, from: 'e7', to: 'e5' })).toEqual({ ok: true });
    expect(await move(white, id, 'e2', 'e4')).toEqual({ ok: true });
    await settle();
    expect(seenByWhite).toEqual(['e4', 'e5']);
    expect(seenByBlack).toEqual(['e4', 'e5']);
    const state = await a.gameStore.getGame(id);
    expect(state.moveLog.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(state.premove).toBeNull();
    expect(db.moveRows.filter((r) => r.game_id === id).map((r) => [r.move_number, r.san])).toEqual([
        [1, 'e4'],
        [2, 'e5'],
    ]);
});

maybe('an illegal premove is dropped and only its owner hears of it, on the other instance', async () => {
    const a = await startInstance('A-pm2');
    const b = await startInstance('B-pm2');
    const id = `${NS}-drop`;
    await seedGame(a.gameStore, id);
    const white = await connectPlayer(a.url, 'alice', cleanups);
    const black = await connectPlayer(b.url, 'bob', cleanups);
    await Promise.all([emitAck(white, 'join_game', id), emitAck(black, 'join_game', id)]);
    await move(white, id, 'e2', 'e4');
    const dropped = { white: [], black: [] };
    white.on('premove_discarded', (p) => dropped.white.push(p));
    black.on('premove_discarded', (p) => dropped.black.push(p));
    // White queues e4-e5; Black's …e5 blocks it.
    expect(await emitAck(white, 'premove_set', { game_id: id, from: 'e4', to: 'e5' })).toEqual({ ok: true });
    expect(await move(black, id, 'e7', 'e5')).toEqual({ ok: true });
    await settle();
    expect(dropped).toEqual({ white: [{ game_id: id, reason: 'illegal_move' }], black: [] });
    expect((await b.gameStore.getGame(id)).moveLog).toHaveLength(2);
});
