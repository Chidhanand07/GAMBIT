/**
 * Tests for rating utility functions used in the frontend
 * (time-control field mapping and matchmaking rating selection).
 * Pure logic — no external dependencies.
 */

function ratingField(timeControl: string): string {
    const mins = parseInt(timeControl) || 10;
    if (mins <= 2) return 'rating_bullet';
    if (mins <= 5) return 'rating_blitz';
    if (mins <= 15) return 'rating_rapid';
    return 'rating_classical';
}

function getRatingForTc(
    mins: number,
    profile: {
        rating_bullet?: number; rating_blitz?: number;
        rating_rapid?: number; rating_classical?: number;
    }
): number {
    if (mins <= 2) return profile.rating_bullet ?? 1200;
    if (mins <= 5) return profile.rating_blitz ?? 1200;
    if (mins <= 15) return profile.rating_rapid ?? 1200;
    return profile.rating_classical ?? 1200;
}

describe('ratingField', () => {
    test('1 min → bullet', () => expect(ratingField('1')).toBe('rating_bullet'));
    test('2 min → bullet', () => expect(ratingField('2')).toBe('rating_bullet'));
    test('3 min → blitz', () => expect(ratingField('3')).toBe('rating_blitz'));
    test('5 min → blitz', () => expect(ratingField('5')).toBe('rating_blitz'));
    test('10 min → rapid', () => expect(ratingField('10')).toBe('rating_rapid'));
    test('15 min → rapid', () => expect(ratingField('15')).toBe('rating_rapid'));
    test('30 min → classical', () => expect(ratingField('30')).toBe('rating_classical'));
    test('invalid string → defaults to rapid (10)', () => expect(ratingField('abc')).toBe('rating_rapid'));
    test('5+3 (blitz with increment) → blitz', () => expect(ratingField('5+3')).toBe('rating_blitz'));
});

describe('getRatingForTc', () => {
    const profile = {
        rating_bullet: 1300,
        rating_blitz: 1400,
        rating_rapid: 1500,
        rating_classical: 1600,
    };

    test('1 min uses bullet rating', () => expect(getRatingForTc(1, profile)).toBe(1300));
    test('3 min uses blitz rating', () => expect(getRatingForTc(3, profile)).toBe(1400));
    test('10 min uses rapid rating', () => expect(getRatingForTc(10, profile)).toBe(1500));
    test('30 min uses classical rating', () => expect(getRatingForTc(30, profile)).toBe(1600));

    test('missing rating falls back to 1200', () => {
        expect(getRatingForTc(1, {})).toBe(1200);
        expect(getRatingForTc(3, {})).toBe(1200);
        expect(getRatingForTc(10, {})).toBe(1200);
        expect(getRatingForTc(30, {})).toBe(1200);
    });
});
