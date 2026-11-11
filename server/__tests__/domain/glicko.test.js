const {
    DEFAULT_RATING,
    MAX_CHANGE,
    RATING_FLOOR,
    RD_CAP,
    calculateNewRatings,
    whiteScore,
    glickoInputs,
    cappedRating,
    statsAfterGame,
} = require('../../src/domain/rating/glicko');

describe('policy constants', () => {
    test('default 1200, change cap 50, floor 100, RD cap 150', () => {
        expect([DEFAULT_RATING, MAX_CHANGE, RATING_FLOOR, RD_CAP]).toEqual([1200, 50, 100, 150]);
    });
});

describe('calculateNewRatings', () => {
    test('defaults: a white win at 1200/350/0.06 (pinned values)', () => {
        const r = calculateNewRatings({ result: 1 });
        expect(r.white.rating).toBe(1362);
        expect(r.black.rating).toBe(1038);
        expect(r.white.rd).toBeCloseTo(290.32, 1);
        expect(r.white.vol).toBeCloseTo(0.06, 4);
    });

    test('explicit inputs are used and ratings are rounded', () => {
        const r = calculateNewRatings({
            whiteRating: 1500,
            whiteRD: 100,
            whiteVol: 0.06,
            blackRating: 1400,
            blackRD: 100,
            blackVol: 0.06,
            result: 0.5,
        });
        expect(Number.isInteger(r.white.rating)).toBe(true);
        expect(r.white.rating).toBeLessThan(1500);
        expect(r.black.rating).toBeGreaterThan(1400);
    });

    test('is deterministic', () => {
        expect(calculateNewRatings({ result: 0 })).toEqual(calculateNewRatings({ result: 0 }));
    });
});

describe('whiteScore', () => {
    test.each([
        ['white', 1],
        ['black', 0],
        ['draw', 0.5],
        [undefined, 0.5],
    ])('%p → %p', (outcome, score) => expect(whiteScore(outcome)).toBe(score));
});

describe('glickoInputs', () => {
    test('missing RD → 100, missing vol → 0.06', () => {
        expect(
            glickoInputs({
                whiteRating: 1300,
                whiteProfile: {},
                blackRating: 1100,
                blackProfile: {},
                outcome: 'black',
            }),
        ).toEqual({
            whiteRating: 1300,
            whiteRD: 100,
            whiteVol: 0.06,
            blackRating: 1100,
            blackRD: 100,
            blackVol: 0.06,
            result: 0,
        });
    });

    test('stored RD is capped at 150; stored vol is used', () => {
        const inputs = glickoInputs({
            whiteRating: 1,
            whiteProfile: { rating_rd: 350, rating_vol: 0.09 },
            blackRating: 2,
            blackProfile: { rating_rd: 80, rating_vol: null },
            outcome: 'white',
        });
        expect(inputs).toMatchObject({ whiteRD: 150, whiteVol: 0.09, blackRD: 80, blackVol: 0.06, result: 1 });
    });
});

describe('cappedRating', () => {
    test.each([
        [1200, 1220, 1220],
        [1200, 1400, 1250], // +50 cap
        [1200, 1000, 1150], // -50 cap
        [120, 10, 100], // floor
        [1200.4, 1210, 1210], // rounding after the cap
        [1200, 1200, 1200],
    ])('old %p, glicko %p → %p', (oldRating, glicko, stored) => expect(cappedRating(oldRating, glicko)).toBe(stored));
});

describe('statsAfterGame', () => {
    const profile = { games_played: 3, wins: 1, losses: 1, draws: 1 };

    test('win / loss / draw for white', () => {
        expect(statsAfterGame(profile, 'white', 'white')).toEqual({ games_played: 4, wins: 2, losses: 1, draws: 1 });
        expect(statsAfterGame(profile, 'black', 'white')).toEqual({ games_played: 4, wins: 1, losses: 2, draws: 1 });
        expect(statsAfterGame(profile, 'draw', 'white')).toEqual({ games_played: 4, wins: 1, losses: 1, draws: 2 });
    });

    test('black perspective', () => {
        expect(statsAfterGame(profile, 'black', 'black')).toMatchObject({ wins: 2, losses: 1 });
        expect(statsAfterGame(profile, 'white', 'black')).toMatchObject({ wins: 1, losses: 2 });
    });

    test('missing counters count as 0; unknown outcome only bumps games_played', () => {
        expect(Object.keys(statsAfterGame({}, 'x', 'white'))).toEqual(['games_played', 'wins', 'losses', 'draws']);
        expect(statsAfterGame({ games_played: null }, 'x', 'white')).toEqual({
            games_played: 1,
            wins: 0,
            losses: 0,
            draws: 0,
        });
    });
});
