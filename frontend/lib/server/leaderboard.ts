import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allRatingPool, type PoolRow } from '@/lib/chess/ratingPools';
import type { RatingField, SpeedBucket } from '@/types/timeControl';

// Leaderboard queries (F-125). Every board lists players by rating desc, then username asc, which is
// also the order public.leaderboard_rank counts in, so a rank and a list position always agree.

/** One pool's rating column, or "All" (profiles.rating_all, a generated column). */
export type LeaderboardField = RatingField | 'rating_all';

const LEADERBOARD_SIZE = 50;
const RATING_FIELD_PREFIX = 'rating_';
const LEADERBOARD_COLUMNS = `username, display_name, rating_all, rating_bullet, rating_blitz, rating_rapid, rating_classical,
    rated_games_bullet, rated_games_blitz, rated_games_rapid, rated_games_classical, games_played, wins, losses, draws`;
const STANDING_COLUMNS = `rating_all, rating_bullet, rating_blitz, rating_rapid, rating_classical,
    rated_games_bullet, rated_games_blitz, rated_games_rapid, rated_games_classical`;

/** The top 50 of a board; a player without a rating there (All before a rated game) is not listed. */
export function listLeaderboard(admin: SupabaseClient, field: LeaderboardField) {
    return admin
        .from('profiles')
        .select(LEADERBOARD_COLUMNS)
        .not(field, 'is', null)
        .order(field, { ascending: false, nullsFirst: false })
        .order('username', { ascending: true })
        .limit(LEADERBOARD_SIZE);
}

/** How many players the board ranks (a HEAD count, no rows read). */
export function countLeaderboardPlayers(admin: SupabaseClient, field: LeaderboardField) {
    return admin.from('profiles').select('id', { count: 'exact', head: true }).not(field, 'is', null);
}

/** The board name public.leaderboard_rank takes: "all" or the pool. */
const boardOf = (field: LeaderboardField) => field.slice(RATING_FIELD_PREFIX.length);

/** The signed-in player on one board: their place (any place, not only the top 50), rating and pool. */
export interface ViewerStanding {
    rank: number | null;
    rating: number | null;
    /** The pool the rating belongs to; for "All", the pool the best rating comes from. */
    pool: SpeedBucket | null;
}

type StandingRow = PoolRow & { rating_all?: number | null };

function poolOf(row: StandingRow, field: LeaderboardField): SpeedBucket | null {
    return field === 'rating_all' ? allRatingPool(row) : (boardOf(field) as SpeedBucket);
}

/**
 * The viewer's standing, from the verified user id (never a client-sent one, NODE-10). Null when
 * either read fails.
 */
export async function viewerStanding(
    admin: SupabaseClient,
    userId: string,
    field: LeaderboardField,
): Promise<ViewerStanding | null> {
    const [rank, profile] = await Promise.all([
        admin.rpc('leaderboard_rank', { p_profile_id: userId, p_board: boardOf(field) }),
        admin.from('profiles').select(STANDING_COLUMNS).eq('id', userId).maybeSingle(),
    ]);
    if (rank.error || profile.error || !profile.data) return null;
    const row = profile.data as StandingRow;
    const rating = row[field];
    return {
        rank: typeof rank.data === 'number' ? rank.data : null,
        rating: typeof rating === 'number' ? Math.round(rating) : null,
        pool: poolOf(row, field),
    };
}
