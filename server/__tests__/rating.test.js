/**
 * server/services/rating.js — Glicko-2 maths, time-control buckets, and the
 * end-of-game profile update (stats + rating, cap, floor, unrated games).
 */
jest.mock('../supabase', () => ({
    supabase: require('./helpers/mockSupabase').createSupabaseMock(),
}));

const { supabase } = require('../supabase');
const ratingService = require('../services/rating');
const { log } = require('../src/observability/log');

function profile(id, overrides = {}) {
    return {
        id,
        rating_bullet: 1200, rating_blitz: 1200, rating_rapid: 1200, rating_classical: 1200,
        rating_rd: 100, rating_vol: 0.06,
        games_played: 10, wins: 5, losses: 4, draws: 1,
        ...overrides,
    };
}

/** RATING-ATOMIC: the arguments of the one apply_game_result call, or undefined. */
function applied() {
    const call = supabase.callsFor('rpc:apply_game_result')[0];
    return call ? supabase.op(call, 'rpc')[0] : undefined;
}

/** A rated game whose profiles are `profiles` and whose apply succeeds. */
function ratedGame(profiles) {
    supabase.queue('profiles', { data: profiles, error: null });
    supabase.queue('rpc:apply_game_result', { data: 'applied', error: null });
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
        ['29', 'rating_rapid'],
        // One threshold set for server and web: 30 minutes is classical (TIME-CONTROL, F7).
        ['30', 'rating_classical'],
        ['60', 'rating_classical'],
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
    test('rated white win: one apply_game_result call with both new ratings, returns changes', async () => {
        ratedGame([profile('w'), profile('b')]);

        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);

        expect(res.white.oldRating).toBe(1200);
        expect(res.white.change).toBeGreaterThan(0);
        expect(res.black.change).toBeLessThan(0);
        expect(res.white.newRating).toBe(res.white.oldRating + res.white.change);

        // Stats (games_played, wins, ...) are incremented inside the function from p_result.
        const args = applied();
        expect(args).toMatchObject({ p_game_id: 'g1', p_white_id: 'w', p_black_id: 'b', p_result: 'white' });
        expect(args.p_white).toMatchObject({ old_rating: 1200, old_rd: 100, old_vol: 0.06, old_games_played: 10 });
        expect(args.p_white.new_rating).toBe(res.white.newRating);
        expect(args.p_black.new_rating).toBe(res.black.newRating);
        expect(args.p_rating_field).toBe('rating_rapid');
        expect(supabase.callsFor('profiles').some(c => supabase.op(c, 'update'))).toBe(false);
    });

    test('updates the rating column for the game\'s time control only', async () => {
        ratedGame([profile('w'), profile('b')]);
        await ratingService.processGameEnd('g1', 'w', 'b', 'black', '3+2', true);
        expect(applied().p_rating_field).toBe('rating_blitz');
    });

    test('draw is passed as the result (the function increments draws for both players)', async () => {
        ratedGame([profile('w'), profile('b')]);
        await ratingService.processGameEnd('g1', 'w', 'b', 'draw', '10', true);
        expect(applied().p_result).toBe('draw');
    });

    test('unrated game: stats only (no rating field, no new values), returns null', async () => {
        supabase.queue('rpc:apply_game_result', { data: 'applied', error: null });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', false);
        expect(res).toBeNull();
        expect(applied()).toEqual({
            p_game_id: 'g1', p_white_id: 'w', p_black_id: 'b', p_result: 'white',
            p_rating_field: null, p_white: null, p_black: null,
        });
    });

    test('rating change is capped at ±50 per game', async () => {
        ratedGame([
            profile('w', { rating_rapid: 800, rating_rd: 350 }),
            profile('b', { rating_rapid: 2800, rating_rd: 350 }),
        ]);
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(Math.abs(res.white.change)).toBeLessThanOrEqual(50);
        expect(Math.abs(res.black.change)).toBeLessThanOrEqual(50);
    });

    test('rating never drops below the floor of 100', async () => {
        ratedGame([profile('w', { rating_rapid: 110 }), profile('b', { rating_rapid: 2000 })]);
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'black', '10', true);
        expect(res.white.newRating).toBeGreaterThanOrEqual(100);
        expect(applied().p_white.new_rating).toBeGreaterThanOrEqual(100);
    });

    test('players with no rating yet start from 1200', async () => {
        ratedGame([
            { id: 'w', games_played: null, wins: null, losses: null, draws: null },
            { id: 'b' },
        ]);
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(res.white.oldRating).toBe(1200);
        // The compare-and-set compares against what is stored: nothing (null).
        expect(applied().p_white).toMatchObject({ old_rating: null, old_rd: null, old_vol: null, old_games_played: null });
    });

    test('returns null and writes nothing if a profile is missing', async () => {
        supabase.queue('profiles', { data: [profile('w')], error: null });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(res).toBeNull();
        expect(applied()).toBeUndefined();
    });

    test('returns null instead of throwing when the database errors', async () => {
        supabase.queue('profiles', () => { throw new Error('db down'); });
        await expect(ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true)).resolves.toBeNull();
    });

    test('returns null (nothing to broadcast) when apply_game_result refuses; the error is logged', async () => {
        supabase.queue('profiles', { data: [profile('w'), profile('b')], error: null });
        supabase.queue('rpc:apply_game_result', { data: null, error: { message: 'write failed' } });
        const res = await ratingService.processGameEnd('g1', 'w', 'b', 'white', '10', true);
        expect(res).toBeNull();
        expect(log.error).toHaveBeenCalledWith('[rating] game g1: not applied:', 'write failed');
    });
});
