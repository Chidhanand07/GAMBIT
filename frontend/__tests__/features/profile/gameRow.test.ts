import { opponentRating, ratingChange, signedChange } from '@/features/profile/gameRow';
import type { ProfileGameRow } from '@/types/profilePage';

const ME = 'me';
const row = (over: Partial<ProfileGameRow> = {}): ProfileGameRow => ({
    id: 'g',
    time_control: '3+0',
    status: 'completed',
    result: 'white',
    winner_id: ME,
    white_accuracy: null,
    black_accuracy: null,
    created_at: '2026-04-21T10:00:00Z',
    ended_at: null,
    white_id: ME,
    black_id: 'opp',
    white: { username: 'me', rating_blitz: 1239 },
    black: { username: 'opp', rating_blitz: 1300 },
    ...over,
});

describe('ratingChange [F-120]', () => {
    test("after − before on the player's side, rounded per value", () => {
        const g = row({ white_rating_before: 1231.4, white_rating_after: 1239.6, black_rating_before: 1150, black_rating_after: 1142.2 });
        expect(ratingChange(g, ME)).toBe(9);
        expect(ratingChange({ ...g, white_id: 'opp' }, ME)).toBe(-8);
    });
    test('null without a snapshot (unrated, or rated before F-120)', () => {
        expect(ratingChange(row(), ME)).toBeNull();
        expect(ratingChange(row({ white_rating_before: 1200, white_rating_after: null }), ME)).toBeNull();
    });
});

describe('signedChange', () => {
    test('a plus sign for gains, the minus of the number for losses, 0 as is', () => {
        expect([signedChange(8), signedChange(-7), signedChange(0)]).toEqual(['+8', '-7', '0']);
    });
});

describe('opponentRating', () => {
    test("the opponent's rating when the game started, from the snapshot", () => {
        expect(opponentRating(row({ black_rating_before: 1150.4 }), ME)).toBe(1150);
        expect(opponentRating(row({ white_id: 'opp', black_id: ME, white_rating_before: 1250 }), ME)).toBe(1250);
    });
    test("without a snapshot: the opponent's current rating in the game's bucket, 1200 when unknown", () => {
        expect(opponentRating(row(), ME)).toBe(1300);
        expect(opponentRating(row({ black: null }), ME)).toBe(1200);
    });
});
