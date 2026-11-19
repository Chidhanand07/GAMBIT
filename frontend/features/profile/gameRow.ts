// Per-game facts for the profile's game lists (Profile.dc.html "Games" rows), read from the
// rating snapshot the server stores on every rated game (F-120). Pure.
import { classifyTimeControl } from '@/lib/chess/timeControl';
import type { ProfileGameRow } from '@/types/profilePage';

const DEFAULT_RATING = 1200;

type Snapshot = Pick<
    ProfileGameRow,
    'white_id' | 'white_rating_before' | 'white_rating_after' | 'black_rating_before' | 'black_rating_after'
>;

const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * The player's rating change in this game, rounded: after − before on their side. Null when the
 * game was not rated or was rated before the server recorded snapshots (F-120).
 */
export function ratingChange(game: Snapshot, profileId: string): number | null {
    const white = game.white_id === profileId;
    const before = white ? game.white_rating_before : game.black_rating_before;
    const after = white ? game.white_rating_after : game.black_rating_after;
    if (!isNumber(before) || !isNumber(after)) return null;
    return Math.round(after) - Math.round(before);
}

/** "+8", "-7", "0". */
export function signedChange(change: number): string {
    return change > 0 ? `+${change}` : String(change);
}

/**
 * The opponent's rating as shown on a game row: their rating when the game started (F-120), or,
 * for a game without a snapshot, their current rating in the game's speed bucket.
 */
export function opponentRating(game: ProfileGameRow, profileId: string): number {
    const white = game.white_id === profileId;
    const atStart = white ? game.black_rating_before : game.white_rating_before;
    if (isNumber(atStart)) return Math.round(atStart);
    const opponent = white ? game.black : game.white;
    return Math.round(opponent?.[`rating_${classifyTimeControl(game.time_control)}`] ?? DEFAULT_RATING);
}
