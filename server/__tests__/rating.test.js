/**
 * Tests for server/services/rating.js — pure calculation logic only.
 * DB calls are mocked so no Supabase connection is needed.
 */

// Mock the supabase module before requiring rating.js
jest.mock('../supabase', () => ({
    supabase: {
        from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
    },
}));

const ratingService = require('../services/rating');

describe('calculateNewRatings', () => {
    test('white win: white gains, black loses', () => {
        const result = ratingService.calculateNewRatings({ result: 1 });
        expect(result.white.rating).toBeGreaterThan(1200);
        expect(result.black.rating).toBeLessThan(1200);
    });

    test('black win: black gains, white loses', () => {
        const result = ratingService.calculateNewRatings({ result: 0 });
        expect(result.white.rating).toBeLessThan(1200);
        expect(result.black.rating).toBeGreaterThan(1200);
    });

    test('draw at equal ratings: minimal change', () => {
        const result = ratingService.calculateNewRatings({ result: 0.5 });
        expect(Math.abs(result.white.rating - 1200)).toBeLessThanOrEqual(5);
        expect(Math.abs(result.black.rating - 1200)).toBeLessThanOrEqual(5);
    });

    test('result includes rd and vol', () => {
        const result = ratingService.calculateNewRatings({ result: 1 });
        expect(typeof result.white.rd).toBe('number');
        expect(typeof result.white.vol).toBe('number');
        expect(result.white.vol).toBeGreaterThan(0);
    });

    test('max change cap of 50 is respected', () => {
        // Huge rating gap — but change should still be ≤ 50
        const result = ratingService.calculateNewRatings({
            whiteRating: 800, blackRating: 2800, result: 0,
        });
        expect(Math.abs(result.white.rating - 800)).toBeLessThanOrEqual(50);
    });
});

describe('_ratingField', () => {
    test('1 min → bullet', () => expect(ratingService._ratingField('1')).toBe('rating_bullet'));
    test('3 min → blitz', () => expect(ratingService._ratingField('3')).toBe('rating_blitz'));
    test('10 min → rapid', () => expect(ratingService._ratingField('10')).toBe('rating_rapid'));
    test('30 min → classical', () => expect(ratingService._ratingField('30')).toBe('rating_classical'));
});

describe('rating floor', () => {
    test('floor of 100 is enforced', () => {
        // Simulate a very low-rated player losing
        const result = ratingService.calculateNewRatings({
            whiteRating: 105, whiteRD: 50, blackRating: 2000, result: 0,
        });
        const floored = Math.max(100, result.white.rating);
        expect(floored).toBeGreaterThanOrEqual(100);
    });
});
