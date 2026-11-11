// `public.profiles` row as read by the frontend (supabase/migrations 00001, 00002, 00005).
import type { RatingField } from './timeControl';

/** Ratings per speed bucket. DECIMAL columns; PostgREST returns them as JSON numbers. */
export type ProfileRatings = Record<RatingField, number>;

export interface Profile extends ProfileRatings {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    country: string | null;
    sex?: string | null;
    is_public?: boolean | null;
    /** Glicko-2 deviation and volatility (migration 00005). */
    rating_rd?: number | null;
    rating_vol?: number | null;
    games_played: number;
    wins: number;
    losses: number;
    draws: number;
    accuracy_rating?: number | null;
    accuracy_rating_blitz?: number | null;
    accuracy_rating_rapid?: number | null;
    accuracy_rating_bullet?: number | null;
    peak_accuracy_rating?: number | null;
    total_moves_analysed?: number | null;
    /**
     * Read by the profile page but not created by any migration in this repo;
     * may be absent at runtime.
     */
    peak_bullet?: number | null;
    peak_blitz?: number | null;
    peak_rapid?: number | null;
    peak_classical?: number | null;
    created_at: string;
}

/**
 * A profile embedded in another row via a PostgREST join
 * (e.g. `white:profiles!games_white_id_fkey(...)`). Each query selects a
 * different column subset, so everything except `username` is optional.
 */
export type ProfileSummary = Pick<Profile, 'username'> &
    Partial<Pick<Profile, 'id' | 'display_name' | 'avatar_url'>> &
    Partial<Record<RatingField, number | null>>;
