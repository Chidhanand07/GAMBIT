import { allRatingPool } from '@/lib/chess/ratingPools';

describe('allRatingPool [F-125]', () => {
    test('the highest rating among the pools with a rated game', () => {
        expect(
            allRatingPool({
                rating_bullet: 1500,
                rating_blitz: 1300,
                rating_rapid: 1400,
                rated_games_bullet: 0,
                rated_games_blitz: 4,
                rated_games_rapid: 1,
            }),
        ).toBe('rapid');
    });
    test('a tie goes to the first pool in bullet, blitz, rapid, classical order', () => {
        expect(allRatingPool({ rating_blitz: 1400, rating_rapid: 1400, rated_games_blitz: 1, rated_games_rapid: 9 })).toBe(
            'blitz',
        );
    });
    test('no rated game, no pool', () => {
        expect(allRatingPool({ rating_rapid: 1200 })).toBeNull();
        expect(allRatingPool({})).toBeNull();
    });
});
