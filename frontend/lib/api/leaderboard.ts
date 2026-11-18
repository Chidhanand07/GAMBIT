// Client-side fetch helpers for the leaderboard page (GET /api/leaderboard and /api/leaderboard/me).
import type { ViewerStanding } from '@/features/leaderboard/leaderboardView';
import type { LeaderboardField, LeaderboardPlayer } from '@/features/leaderboard/types';
import type { SpeedBucket } from '@/types/timeControl';

export interface LeaderboardPage {
    /** The top players on the board, best first (at most 50). */
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
 * The top players on a board. A non-OK status reads as an empty board (the route answers `[]` on a
 * database error too); a network failure rejects so the caller keeps what it shows.
 */
export async function fetchLeaderboard(field: LeaderboardField): Promise<LeaderboardPage> {
    const res = await fetch(`/api/leaderboard?field=${field}`);
    if (!res.ok) return { players: [], total: null };
    return { players: (await res.json()) as LeaderboardPlayer[], total: totalFrom(res.headers) };
}

const POOLS: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];
const numberOrNull = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** The signed-in player's rank, rating and pool on a board (F-125); null when it could not be read. */
export async function fetchViewerStanding(field: LeaderboardField): Promise<ViewerStanding | null> {
    const res = await fetch(`/api/leaderboard/me?field=${field}`);
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return {
        rank: numberOrNull(body.rank),
        rating: numberOrNull(body.rating),
        pool: POOLS.includes(body.pool as SpeedBucket) ? (body.pool as SpeedBucket) : null,
    };
}
