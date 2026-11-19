// Client-side fetch helper for the leaderboard page (GET /api/leaderboard, app/api/leaderboard/route.ts).
import type { LeaderboardPlayer } from '@/features/leaderboard/types';
import type { RatingField } from '@/types/timeControl';

export interface LeaderboardPage {
    /** The top players by the field, best first (at most 50). */
    players: LeaderboardPlayer[];
    /** How many players the board ranks in all (`X-Total-Count`), or null when the server did not say. */
    total: number | null;
}

function totalFrom(headers: Headers): number | null {
    const raw = headers.get('X-Total-Count');
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * The top players by `field`. A non-OK status reads as an empty board (the route answers
 * `[]` on a database error too); a network failure rejects so the caller keeps what it shows.
 */
export async function fetchLeaderboard(field: RatingField): Promise<LeaderboardPage> {
    const res = await fetch(`/api/leaderboard?field=${field}`);
    if (!res.ok) return { players: [], total: null };
    return { players: (await res.json()) as LeaderboardPlayer[], total: totalFrom(res.headers) };
}
