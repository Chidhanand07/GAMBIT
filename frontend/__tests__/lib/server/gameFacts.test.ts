import { bestWins, overallBestWin } from '@/lib/server/gameFacts';

const ME = 'me';

describe('bestWins [F-122]', () => {
    test('only wins with a snapshot count; draws, losses, aborted and pre-snapshot games do not', () => {
        const wins = bestWins(
            [
                { white_id: ME, black_id: 'a', result: 'white', winner_id: null, rating_category: 'bullet', black_rating_before: 1400 },
                { white_id: ME, black_id: 'b', result: 'draw', winner_id: null, rating_category: 'bullet', black_rating_before: 2000 },
                { white_id: 'c', black_id: ME, result: 'white', winner_id: null, rating_category: 'bullet', white_rating_before: 2100 },
                { white_id: ME, black_id: 'd', status: 'aborted', result: null, winner_id: null, rating_category: 'bullet', black_rating_before: 2200 },
                { white_id: ME, black_id: 'e', result: 'white', winner_id: null, rating_category: null },
                { white_id: ME, black_id: 'f', result: 'white', winner_id: null, rating_category: 'classical', black_rating_before: null },
            ],
            ME,
        );
        expect(wins).toEqual({ bullet: 1400, blitz: null, rapid: null, classical: null });
    });

    test('overall best is the highest pool value, null without any', () => {
        expect(overallBestWin({ bullet: 1400, blitz: 1250, rapid: null, classical: null })).toBe(1400);
        expect(overallBestWin({ bullet: null, blitz: null, rapid: null, classical: null })).toBeNull();
    });
});
