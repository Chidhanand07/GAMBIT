/**
 * server/services/matchmaking.js — rated queue, search radius, pairing rules.
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());

const { supabase } = require('../supabase');
const redis = require('../lib/redis');
const MatchmakingService = require('../services/matchmaking');
const { getGame } = require('../lib/gameStore');
const { makeIo, START_FEN } = require('./helpers/fixtures');

const NOW = new Date('2026-01-01T12:00:00Z').getTime();

let io;
let mm;

function user(id, rating, games_played = 50) {
    return { id, username: id, rating, games_played };
}

/** Insert result echoes the inserted row with an id, like Supabase `.insert().select().single()`. */
function echoInsert(id = 'new-game') {
    return (call) => ({ data: { id, ...supabase.op(call, 'insert')[0] }, error: null });
}

beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    supabase.reset();
    redis._reset();
    io = makeIo();
    mm = new MatchmakingService(io);
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    mm.destroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('queue', () => {
    test('joinQueue adds the player and tells their socket', () => {
        mm.joinQueue(user('a', 1500), 'sock-a', '10', 0);
        expect(mm.queue.get('a')).toMatchObject({ rating: 1500, time_control: '10+0', increment: 0, isProvisional: false, isRated: true });
        expect(io.emitted).toContainEqual({ room: 'sock-a', event: 'queue_joined', payload: { position: 1, estimated_wait: 10 } });
    });

    test('joining twice keeps one entry', () => {
        mm.joinQueue(user('a', 1500), 's1', '10', 0);
        mm.joinQueue(user('a', 1500), 's2', '10', 0);
        expect(mm.queue.size).toBe(1);
        expect(mm.queue.get('a').socketId).toBe('s1');
    });

    test('players with under 5 games are provisional; missing rating defaults to 1200', () => {
        mm.joinQueue({ id: 'n', username: 'n' }, 's', '10', 0);
        expect(mm.queue.get('n')).toMatchObject({ rating: 1200, isProvisional: true });
    });

    test('leaveQueue removes the player', () => {
        mm.joinQueue(user('a', 1500), 's', '10', 0);
        mm.leaveQueue('a');
        expect(mm.queue.size).toBe(0);
    });
});

describe('getSearchRadius', () => {
    test.each([
        [0, 50], [10, 50], [11, 100], [20, 100], [35, 150], [60, 250], [120, 400], [121, 9999],
    ])('after %ss waiting → ±%s', (sec, radius) => expect(mm.getSearchRadius(sec)).toBe(radius));
});

describe('matchPlayers', () => {
    test('pairs two close-rated players with the same time control', async () => {
        supabase.queue('games', echoInsert());
        mm.joinQueue(user('a', 1500), 'sa', '10', 0);
        mm.joinQueue(user('b', 1530), 'sb', '10', 0);

        await mm.matchPlayers();

        expect(mm.queue.size).toBe(0);
        const found = io.eventsNamed('match_found');
        expect(found.map(f => f.room).sort()).toEqual(['sa', 'sb']);
        expect(found.map(f => f.payload.color).sort()).toEqual(['black', 'white']);
        // Each player sees the other as opponent.
        for (const f of found) expect(f.payload.opponent.socketId).not.toBe(f.room);
    });

    test('never pairs different time controls', async () => {
        mm.joinQueue(user('a', 1500), 'sa', '10', 0);
        mm.joinQueue(user('b', 1500), 'sb', '3', 0);
        await mm.matchPlayers();
        expect(mm.queue.size).toBe(2);
        expect(supabase.callsFor('games')).toHaveLength(0);
    });

    test('does not pair a big rating gap at first, but does once the radius widens', async () => {
        mm.joinQueue(user('a', 1500), 'sa', '10', 0);
        mm.joinQueue(user('b', 1700), 'sb', '10', 0);

        await mm.matchPlayers();
        expect(mm.queue.size).toBe(2);

        supabase.queue('games', echoInsert());
        jest.setSystemTime(NOW + 61 * 1000); // radius → 400
        await mm.matchPlayers();
        expect(mm.queue.size).toBe(0);
    });

    test('two provisional players always match', async () => {
        supabase.queue('games', echoInsert());
        mm.joinQueue(user('a', 600, 0), 'sa', '10', 0);
        mm.joinQueue(user('b', 2400, 1), 'sb', '10', 0);
        await mm.matchPlayers();
        expect(mm.queue.size).toBe(0);
    });

    test('a provisional player only meets established players rated 800–1400', async () => {
        mm.joinQueue(user('new', 1200, 0), 's1', '10', 0);
        mm.joinQueue(user('strong', 1900), 's2', '10', 0);
        await mm.matchPlayers();
        expect(mm.queue.size).toBe(2);

        supabase.queue('games', echoInsert());
        mm.joinQueue(user('mid', 1300), 's3', '10', 0);
        await mm.matchPlayers();
        expect([...mm.queue.keys()]).toEqual(['strong']);
    });

    test('longest-waiting player is matched first', async () => {
        supabase.queue('games', echoInsert());
        mm.joinQueue(user('first', 1500), 's1', '10', 0);
        jest.setSystemTime(NOW + 1000);
        mm.joinQueue(user('second', 1500), 's2', '10', 0);
        jest.setSystemTime(NOW + 2000);
        mm.joinQueue(user('third', 1500), 's3', '10', 0);

        await mm.matchPlayers();
        expect([...mm.queue.keys()]).toEqual(['third']);
    });

    test('a player is never paired twice in one round', async () => {
        supabase.queue('games', echoInsert('g1'), echoInsert('g2'));
        for (const id of ['a', 'b', 'c', 'd']) mm.joinQueue(user(id, 1500), `s-${id}`, '10', 0);
        await mm.matchPlayers();
        const rooms = io.eventsNamed('match_found').map(e => e.room);
        expect(rooms).toHaveLength(4);
        expect(new Set(rooms).size).toBe(4);
    });

    test('broadcasts how many players are searching', async () => {
        mm.joinQueue(user('a', 1500), 'sa', '10', 0);
        await mm.matchPlayers();
        expect(io.emitted).toContainEqual({ room: '*', event: 'queue_status', payload: { players_searching: 1 } });
    });

    test('runs automatically every second', async () => {
        supabase.queue('games', echoInsert());
        mm.joinQueue(user('a', 1500), 'sa', '10', 0);
        mm.joinQueue(user('b', 1500), 'sb', '10', 0);
        await jest.advanceTimersByTimeAsync(1000);
        expect(io.eventsNamed('match_found')).toHaveLength(2);
    });
});

describe('createGame', () => {
    test('creates an active game row and the Redis state with correct clocks', async () => {
        supabase.queue('games', echoInsert('g-new'));
        jest.spyOn(Math, 'random').mockReturnValue(0.9); // p1 plays white
        mm.joinQueue(user('a', 1500), 'sa', '3+2', 2);
        mm.joinQueue(user('b', 1500), 'sb', '3+2', 2);

        await mm.matchPlayers();

        const row = supabase.op(supabase.callsFor('games')[0], 'insert')[0];
        expect(row).toMatchObject({ white_id: 'a', black_id: 'b', time_control: '3+2', status: 'active' });

        expect(await getGame('g-new')).toMatchObject({
            fen: START_FEN, whiteId: 'a', blackId: 'b',
            whiteClockMs: 180000, blackClockMs: 180000, incrementMs: 2000,
            activeSide: 'w', status: 'active', isRated: true, lastMoveAt: null,
        });
        expect(await redis.smembers('active_games')).toEqual(['g-new']);
    });

    test('casual queue creates an unrated game', async () => {
        supabase.queue('games', echoInsert('g'));
        mm.joinQueue(user('a', 1500), 'sa', '10', 0, false);
        mm.joinQueue(user('b', 1500), 'sb', '10', 0, false);
        await mm.matchPlayers();
        expect((await getGame('g')).isRated).toBe(false);
    });

    test('database failure: no match_found, no Redis state', async () => {
        supabase.queue('games', { data: null, error: { message: 'insert failed' } });
        mm.joinQueue(user('a', 1500), 'sa', '10', 0);
        mm.joinQueue(user('b', 1500), 'sb', '10', 0);
        await mm.matchPlayers();
        expect(io.eventsNamed('match_found')).toHaveLength(0);
        expect(await redis.smembers('active_games')).toEqual([]);
    });

    test.todo('players are put back in the queue when game creation fails (today they are silently dropped)');
});
