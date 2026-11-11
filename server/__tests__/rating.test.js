/**
 * server/services/rating.js — Glicko-2 maths, time-control buckets, and the
 * end-of-game profile update (stats + rating, cap, floor, unrated games).
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));

const { supabase } = require('../supabase');
const ratingService = require('../services/rating');

function profile(id, overrides = {}) {
    return {
        id,
        rating_bullet: 1200, rating_blitz: 1200, rating_rapid: 1200, rating_classical: 1200,
        rating_rd: 100, rating_vol: 0.06,
        games_played: 10, wins: 5, losses: 4, draws: 1,
        ...overrides,
    };
}

function updatesFor(id) {
    const call = supabase.callsFor('profiles').find(c =>
        supabase.op(c, 'update') && supabase.op(c, 'eq')?.[1] === id
    );
    return call ? supabase.op(call, 'update')[0] : undefined;
}

beforeEach(() => {
    supabase.reset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('calculateNewRatings', () => {
    test('white win: white gains, black loses', () => {
        const r = ratingService.calculateNewRatings({ result: 1 });
        expect(r.white.rating).toBeGreaterThan(1200);
        expect(r.black.rating).toBeLessThan(1200);
    });

    test('black win: black gains, white loses', () => {
        const r = ratingService.calculateNewRatings({ result: 0 });
        expect(r.white.rating).toBeLessThan(1200);
        expect(r.black.rating).toBeGreaterThan(1200);
    });

    test('draw at equal ratings: no meaningful change', () => {
        const r = ratingService.calculateNewRatings({ result: 0.5 });
        expect(Math.abs(r.white.rating - 1200)).toBeLessThanOrEqual(5);
        expect(Math.abs(r.black.rating - 1200)).toBeLessThanOrEqual(5);
    });

    test('is symmetric: swapping colours mirrors the result', () => {
        const a = ratingService.calculateNewRatings({ whiteRating: 1500, blackRating: 1300, result: 1 });
        const b = ratingService.calculateNewRatings({ whiteRating: 1300, blackRating: 1500, result: 0 });
        expect(a.white.rating).toBe(b.black.rating);
        expect(a.black.rating).toBe(b.white.rating);
    });

    test('upset win gains more than an expected win', () => {
        const upset = ratingService.calculateNewRatings({ whiteRating: 1200, blackRating: 1600, whiteRD: 100, blackRD: 100, result: 1 });
        const expected = ratingService.calculateNewRatings({ whiteRating: 1600, blackRating: 1200, whiteRD: 100, blackRD: 100, result: 1 });
        expect(upset.white.rating - 1200).toBeGreaterThan(expected.white.rating - 1600);
    });

    test('returns rd and vol as positive numbers', () => {
        const r = ratingService.calculateNewRatings({ result: 1 });
        for (const side of [r.white, r.black]) {
            expect(side.rd).toBeGreaterThan(0);
            expect(side.vol).toBeGreaterThan(0);
            expect(Number.isInteger(side.rating)).toBe(true);
        }
    });
});

describe('_ratingField (server time-control buckets)', () => {
    test.each([
        ['1', 'rating_bullet'],
        ['2', 'rating_bullet'],
        ['1+1', 'rating_bullet'],
        ['3', 'rating_blitz'],
        ['5', 'rating_blitz'],
        ['3+2', 'rating_blitz'],
        ['10', 'rating_rapid'],
        ['15+10', 'rating_rapid'],
        ['30', 'rating_rapid'],
        ['60', 'rating_rapid'],
        ['61', 'rating_classical'],
        ['90+30', 'rating_classical'],
    ])('%s min → %s', (tc, field) => {
        expect(ratingService._ratingField(tc)).toBe(field);
    });

    test('missing or garbage time control falls back to rapid (10 min)', () => {
        expect(ratingService._ratingField(undefined)).toBe('rating_rapid');
        expect(ratingService._ratingField('')).toBe('rating_rapid');
        expect(ratingService._ratingField('abc')).toBe('rating_rapid');
    });
});

describe('processGameEnd', () => {
    test('rated white win: updates both ratings and stats, returns changes', async () => {
        supabase.queue('profiles', { data: [profile('w'), profile('b')], error: null });

        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);

        expect(res.white.oldRating).toBe(1200);
        expect(res.white.change).toBeGreaterThan(0);
        expect(res.black.change).toBeLessThan(0);
        expect(res.white.newRating).toBe(res.white.oldRating + res.white.change);

        const w = updatesFor('w');
        const b = updatesFor('b');
        expect(w).toMatchObject({ games_played: 11, wins: 6, losses: 4, draws: 1 });
        expect(b).toMatchObject({ games_played: 11, wins: 5, losses: 5, draws: 1 });
        expect(w.rating_rapid).toBe(res.white.newRating);
        expect(b.rating_rapid).toBe(res.black.newRating);
        expect(w.rating_blitz).toBeUndefined();
    });

    test('updates the rating column for the game\'s time control only', async () => {
        supabase.queue('profiles', { data: [profile('w'), profile('b')], error: null });
        await ratingService.processGameEnd('g1', 'w', 'b', 'black', '3+2', true);
        expect(updatesFor('w')).toHaveProperty('rating_blitz');
        expect(updatesFor('w')).not.toHaveProperty('rating_rapid');
    });

    test('draw increments draws for both players', async () => {
        supabase.queue('profiles', { data: [profile('w'), profile('b')], error: null });
        await ratingService.processGameEnd('g1', 'w', 'b', 'draw', '10', true);
        expect(updatesFor('w')).toMatchObject({ draws: 2, wins: 5, losses: 4 });
        expect(updatesFor('b')).toMatchObject({ draws: 2, wins: 5, losses: 4 });
    });

    test('unrated game: stats update, rating untouched, returns null', async () => {
        supabase.queue('profiles', { data: [profile('w'), profile('b')], error: null });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', false);
        expect(res).toBeNull();
        expect(updatesFor('w')).toMatchObject({ games_played: 11, wins: 6 });
        expect(updatesFor('w')).not.toHaveProperty('rating_rapid');
        expect(updatesFor('w')).not.toHaveProperty('rating_rd');
    });

    test('rating change is capped at ±50 per game', async () => {
        supabase.queue('profiles', {
            data: [
                profile('w', { rating_rapid: 800, rating_rd: 350 }),
                profile('b', { rating_rapid: 2800, rating_rd: 350 }),
            ],
            error: null,
        });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(Math.abs(res.white.change)).toBeLessThanOrEqual(50);
        expect(Math.abs(res.black.change)).toBeLessThanOrEqual(50);
    });

    test('rating never drops below the floor of 100', async () => {
        supabase.queue('profiles', {
            data: [profile('w', { rating_rapid: 110 }), profile('b', { rating_rapid: 2000 })],
            error: null,
        });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'black', '10', true);
        expect(res.white.newRating).toBeGreaterThanOrEqual(100);
        expect(updatesFor('w').rating_rapid).toBeGreaterThanOrEqual(100);
    });

    test('players with no rating yet start from 1200', async () => {
        supabase.queue('profiles', {
            data: [
                { id: 'w', games_played: null, wins: null, losses: null, draws: null },
                { id: 'b' },
            ],
            error: null,
        });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(res.white.oldRating).toBe(1200);
        expect(updatesFor('w')).toMatchObject({ games_played: 1, wins: 1, losses: 0, draws: 0 });
    });

    test('returns null and writes nothing if a profile is missing', async () => {
        supabase.queue('profiles', { data: [profile('w')], error: null });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(res).toBeNull();
        expect(updatesFor('w')).toBeUndefined();
    });

    test('returns null instead of throwing when the database errors', async () => {
        supabase.queue('profiles', () => { throw new Error('db down'); });
        await expect(ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true)).resolves.toBeNull();
    });

    test('still returns changes when a profile update fails (logged, not thrown)', async () => {
        supabase.queue('profiles',
            { data: [profile('w'), profile('b')], error: null },
            { data: null, error: { message: 'write failed' } },
            { data: null, error: null },
        );
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(res).not.toBeNull();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('white update error'), 'write failed');
    });
});
