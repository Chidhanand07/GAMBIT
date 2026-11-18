import { ratingHistory } from '@/lib/server/ratingHistory';

const ME = 'me';
const rated = (category: string, at: string, mine: [number, number], white = true) => ({
    white_id: white ? ME : 'opp',
    rating_category: category,
    white_rating_before: white ? mine[0] : 1500,
    white_rating_after: white ? mine[1] : 1490,
    black_rating_before: white ? 1500 : mine[0],
    black_rating_after: white ? 1490 : mine[1],
    ended_at: at,
});

describe('ratingHistory [F-121]', () => {
    test("per pool, oldest first: the rating before the first game, then after each, the player's side only", () => {
        const history = ratingHistory(
            [
                rated('blitz', '2026-04-03T00:00:00Z', [1208.4, 1196.2], false),
                rated('blitz', '2026-04-01T00:00:00Z', [1200, 1208.4]),
                rated('rapid', '2026-04-02T00:00:00Z', [1200, 1122]),
            ],
            ME,
        );
        expect(history).toEqual({ bullet: [], blitz: [1200, 1208, 1196], rapid: [1200, 1122], classical: [] });
    });

    test('games without a snapshot (unrated, or rated before F-120) are left out', () => {
        const history = ratingHistory(
            [
                { white_id: ME, rating_category: null, ended_at: '2026-01-01T00:00:00Z' },
                { white_id: ME, rating_category: 'blitz', white_rating_before: null, white_rating_after: null },
                { white_id: ME, rating_category: 'daily', white_rating_before: 1200, white_rating_after: 1210 },
            ],
            ME,
        );
        expect(history).toEqual({ bullet: [], blitz: [], rapid: [], classical: [] });
    });

    test('falls back to created_at when ended_at is missing', () => {
        const a = { ...rated('rapid', '', [1200, 1210]), ended_at: null, created_at: '2026-02-02T00:00:00Z' };
        const b = { ...rated('rapid', '', [1210, 1220]), ended_at: null, created_at: '2026-02-03T00:00:00Z' };
        expect(ratingHistory([b, a], ME).rapid).toEqual([1200, 1210, 1220]);
    });
});
