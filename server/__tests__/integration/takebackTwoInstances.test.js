/**
 * Takebacks across two game-server instances behind one Redis [TAKEBACK][MULTI-INSTANCE]
 * (ADR F-152, TEST-06). White is on instance A, Black on instance B. Skipped with a message
 * when no real Redis is available.
 */
const { startRealRedis, uniqueNamespace } = require('../helpers/realRedis');
const { instanceFactory, connectPlayer, once, emitAck, seedGame } = require('../helpers/twoInstances');

const NS = uniqueNamespace('takeback-two-instances');
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
const rowsOf = (id) => db.moveRows.filter((r) => r.game_id === id).map((r) => [r.move_number, r.san]);

maybe('a request on A accepted on B: both see the restored state; Redis and the moves rows agree', async () => {
    const a = await startInstance('A-tb');
    const b = await startInstance('B-tb');
    const id = `${NS}-accept`;
    // F-166: no preferences wired here, so takebacks are allowed (was: seeded per-game takebackPrefs).
    await seedGame(a.gameStore, id);
    const white = await connectPlayer(a.url, 'alice', cleanups);
    const black = await connectPlayer(b.url, 'bob', cleanups);
    await Promise.all([emitAck(white, 'join_game', id), emitAck(black, 'join_game', id)]);
    await move(white, id, 'e2', 'e4');
    await move(black, id, 'e7', 'e5');
    await move(white, id, 'g1', 'f3');
    await new Promise((r) => setTimeout(r, 100));
    expect(rowsOf(id)).toEqual([
        [1, 'e4'],
        [2, 'e5'],
        [3, 'Nf3'],
    ]);

    const asked = once(black, 'takeback_requested');
    expect(await emitAck(white, 'takeback_request', { game_id: id })).toEqual({ ok: true });
    expect(await asked).toEqual({ game_id: id, by: 'white', plies: 1 });

    const applied = [once(white, 'takeback_applied'), once(black, 'takeback_applied')];
    expect(await emitAck(black, 'takeback_accept', { game_id: id })).toEqual({ ok: true });
    const [w, bl] = await Promise.all(applied);
    expect(w).toEqual(bl);
    expect(w).toMatchObject({ plies: 1, activeSide: 'w', moveLog: [{ san: 'e4' }, { san: 'e5' }] });
    await new Promise((r) => setTimeout(r, 100));
    expect(rowsOf(id)).toEqual([
        [1, 'e4'],
        [2, 'e5'],
    ]);

    // White plays another move from the restored position, on its own instance.
    expect(await move(white, id, 'b1', 'c3')).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(rowsOf(id)).toEqual([
        [1, 'e4'],
        [2, 'e5'],
        [3, 'Nc3'],
    ]);
    const state = await b.gameStore.getGame(id);
    expect(state.moveLog.map((m) => m.san)).toEqual(['e4', 'e5', 'Nc3']);
    expect(state.clockLog).toHaveLength(3);
});

maybe('accepting on B while White moves on A: the move wins, or the takeback does, never both', async () => {
    const a = await startInstance('A-tb2');
    const b = await startInstance('B-tb2');
    const id = `${NS}-race`;
    // F-166: no preferences wired here, so takebacks are allowed (was: seeded per-game takebackPrefs).
    await seedGame(a.gameStore, id);
    const white = await connectPlayer(a.url, 'alice', cleanups);
    const black = await connectPlayer(b.url, 'bob', cleanups);
    await Promise.all([emitAck(white, 'join_game', id), emitAck(black, 'join_game', id)]);
    await move(white, id, 'e2', 'e4');
    await move(black, id, 'e7', 'e5');
    // Black asks to undo e5. White answers from a second tab on B while moving on A.
    await emitAck(black, 'takeback_request', { game_id: id });
    const whiteOnB = await connectPlayer(b.url, 'alice', cleanups);
    await emitAck(whiteOnB, 'join_game', id);
    const [moved, accepted] = await Promise.all([
        move(white, id, 'g1', 'f3'),
        emitAck(whiteOnB, 'takeback_accept', { game_id: id }),
    ]);
    const state = await a.gameStore.getGame(id);
    if (moved.ok) {
        expect(accepted).toEqual({ ok: false, error: 'no_pending_request' });
        expect(state.moveLog.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    } else {
        expect(accepted).toEqual({ ok: true });
        expect(moved).toEqual({ ok: false, error: 'not_your_turn' });
        expect(state.moveLog.map((m) => m.san)).toEqual(['e4']);
    }
});
