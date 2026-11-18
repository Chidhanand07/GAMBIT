// Client-side fetch helper for the leaderboard page (GET /api/leaderboard, app/api/leaderboard/route.ts).
import type { LeaderboardPlayer } from '@/features/leaderboard/types';
import type { RatingField } from '@/types/timeControl';

/**
 * The top players by `field`. A non-OK status reads as an empty board (the route answers
 * `[]` on a database error too); a network failure rejects so the caller keeps what it shows.
 */
export async function fetchLeaderboard(field: RatingField): Promise<LeaderboardPlayer[]> {
    const res = await fetch(`/api/leaderboard?field=${field}`);
    if (!res.ok) return [];
    return (await res.json()) as LeaderboardPlayer[];
}
