/**
 * server/services/friends.js — private games and invite links.
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));
jest.mock('../lib/redis', () => require('./helpers/mockRedis').createRedisMock());

const { supabase } = require('../supabase');
const redis = require('../lib/redis');
const friendsService = require('../services/friends');
const { getGame } = require('../lib/gameStore');
const { START_FEN } = require('./helpers/fixtures');

const HOUR = 3600 * 1000;

function waitingGame(overrides = {}) {
    return {
        id: 'game-1',
        status: 'waiting',
        white_id: 'creator',
        black_id: null,
        invite_token: 'tok',
        invite_expires_at: new Date(Date.now() + HOUR).toISOString(),
        is_rated: true,
        time_control: '5+3',
        ...overrides,
    };
}

beforeEach(() => {
    supabase.reset();
    redis._reset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('createPrivateGame', () => {
    test.each([
        ['white', { white_id: 'u1', black_id: null }],
        ['WHITE', { white_id: 'u1', black_id: null }],
        ['black', { white_id: null, black_id: 'u1' }],
    ])('color %s seats the creator correctly', async (color, seats) => {
        supabase.queue('games', (call) => ({ data: { id: 'g', ...supabase.op(call, 'insert')[0] }, error: null }));
        const game = await friendsService.createPrivateGame('u1', '10', color, true);
        expect(game).toMatchObject(seats);
    });

    test('random color seats the creator on exactly one side', async () => {
        for (const roll of [0.1, 0.9]) {
            jest.spyOn(Math, 'random').mockReturnValueOnce(roll);
            supabase.queue('games', (call) => ({ data: supabase.op(call, 'insert')[0], error: null }));
            const g = await friendsService.createPrivateGame('u1', '10', undefined, true);
            expect([g.white_id, g.black_id].filter(Boolean)).toEqual(['u1']);
        }
    });

    test('creates a waiting game with a 10-char token that expires in 48h', async () => {
        supabase.queue('games', (call) => ({ data: supabase.op(call, 'insert')[0], error: null }));
        const before = Date.now();
        const game = await friendsService.createPrivateGame('u1', '3+2', 'white', false);

        expect(game.status).toBe('waiting');
        expect(game.time_control).toBe('3+2');
        expect(game.is_rated).toBe(false);
        expect(game.invite_token).toMatch(/^[A-Za-z0-9_-]{10}$/);
        const expiresIn = new Date(game.invite_expires_at).getTime() - before;
        expect(expiresIn).toBeGreaterThan(47 * HOUR);
        expect(expiresIn).toBeLessThanOrEqual(48 * HOUR + 1000);
    });

    test('tokens are unique across games', async () => {
        const tokens = new Set();
        for (let i = 0; i < 50; i++) {
            supabase.queue('games', (call) => ({ data: supabase.op(call, 'insert')[0], error: null }));
            tokens.add((await friendsService.createPrivateGame('u1', '10', 'white', true)).invite_token);
        }
        expect(tokens.size).toBe(50);
    });

    test('throws the database error', async () => {
        supabase.queue('games', { data: null, error: new Error('insert failed') });
        await expect(friendsService.createPrivateGame('u1', '10', 'white', true)).rejects.toThrow('insert failed');
    });
});

describe('getGameByToken', () => {
    test('returns the game for a valid token', async () => {
        supabase.queue('games', { data: waitingGame(), error: null });
        await expect(friendsService.getGameByToken('tok')).resolves.toMatchObject({ id: 'game-1' });
        const call = supabase.callsFor('games')[0];
        expect(supabase.op(call, 'eq')).toEqual(['invite_token', 'tok']);
    });

    test('returns null for an unknown token', async () => {
        supabase.queue('games', { data: null, error: null });
        await expect(friendsService.getGameByToken('nope')).resolves.toBeNull();
    });

    test('returns null on a database error', async () => {
        supabase.queue('games', { data: null, error: { message: 'boom' } });
        await expect(friendsService.getGameByToken('tok')).resolves.toBeNull();
    });

    test('accepts a token expired by less than the 5-minute grace period', async () => {
        const expires = new Date(Date.now() - 4 * 60 * 1000).toISOString();
        supabase.queue('games', { data: waitingGame({ invite_expires_at: expires }), error: null });
        await expect(friendsService.getGameByToken('tok')).resolves.not.toBeNull();
    });

    test('rejects a token expired by more than the grace period', async () => {
        const expires = new Date(Date.now() - 6 * 60 * 1000).toISOString();
        supabase.queue('games', { data: waitingGame({ invite_expires_at: expires }), error: null });
        await expect(friendsService.getGameByToken('tok')).resolves.toBeNull();
    });
});

describe('joinPrivateGame', () => {
    test('second player takes the empty seat and the game starts', async () => {
        supabase.queue('games',
            { data: waitingGame(), error: null },
            (call) => ({ data: { ...waitingGame(), ...supabase.op(call, 'update')[0] }, error: null }),
        );

        const game = await friendsService.joinPrivateGame('tok', 'joiner');

        expect(game).toMatchObject({ status: 'active', white_id: 'creator', black_id: 'joiner' });
        const update = supabase.callsFor('games')[1];
        // Atomic guard: the update only applies while the game is still waiting.
        expect(update.ops).toEqual(expect.arrayContaining([['eq', 'id', 'game-1'], ['eq', 'status', 'waiting']]));
    });

    test('joiner takes white when the creator chose black', async () => {
        supabase.queue('games',
            { data: waitingGame({ white_id: null, black_id: 'creator' }), error: null },
            (call) => ({ data: { ...waitingGame(), ...supabase.op(call, 'update')[0] }, error: null }),
        );
        const game = await friendsService.joinPrivateGame('tok', 'joiner');
        expect(game).toMatchObject({ white_id: 'joiner', black_id: 'creator' });
    });

    test('writes the initial game state to Redis with clocks and increment', async () => {
        supabase.queue('games',
            { data: waitingGame(), error: null },
            (call) => ({ data: { ...waitingGame(), ...supabase.op(call, 'update')[0] }, error: null }),
        );
        await friendsService.joinPrivateGame('tok', 'joiner');

        const state = await getGame('game-1');
        expect(state).toMatchObject({
            fen: START_FEN,
            whiteId: 'creator',
            blackId: 'joiner',
            whiteClockMs: 5 * 60 * 1000,
            blackClockMs: 5 * 60 * 1000,
            incrementMs: 3000,
            activeSide: 'w',
            status: 'active',
            isRated: true,
            lastMoveAt: null,
        });
        expect(await redis.smembers('active_games')).toContain('game-1');
    });

    test('creator re-opening their own link gets the game back without joining', async () => {
        supabase.queue('games', { data: waitingGame(), error: null });
        const game = await friendsService.joinPrivateGame('tok', 'creator');
        expect(game.white_id).toBe('creator');
        expect(supabase.callsFor('games')).toHaveLength(1); // no update issued
    });

    test('rejects an invalid or expired token', async () => {
        supabase.queue('games', { data: null, error: null });
        await expect(friendsService.joinPrivateGame('bad', 'u')).rejects.toThrow('Invalid or expired token');
    });

    test('rejects a game that has already started', async () => {
        supabase.queue('games', { data: waitingGame({ status: 'active', black_id: 'x' }), error: null });
        await expect(friendsService.joinPrivateGame('tok', 'u')).rejects.toThrow('Game already started');
    });

    test('loses the race cleanly when someone else joined first', async () => {
        supabase.queue('games', { data: waitingGame(), error: null }, { data: null, error: null });
        await expect(friendsService.joinPrivateGame('tok', 'late')).rejects.toThrow('Game already started or not found');
        expect(await getGame('game-1')).toBeNull();
    });

    test('propagates a database error from the join update', async () => {
        supabase.queue('games', { data: waitingGame(), error: null }, { data: null, error: new Error('update failed') });
        await expect(friendsService.joinPrivateGame('tok', 'u')).rejects.toThrow('update failed');
    });
});
