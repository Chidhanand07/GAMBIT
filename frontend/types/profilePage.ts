// Response shapes of the profile page's API routes (app/api/profile/[username]/{games,stats}).
import type { Game } from './game';
import type { ProfileSummary } from './profile';
import type { SpeedBucket } from './timeControl';

/** Row of GET /api/profile/[username]/games (players embedded via PostgREST joins). */
export interface ProfileGameRow
    extends
        Pick<Game, 'id' | 'time_control' | 'status' | 'result' | 'winner_id'>,
        Partial<
            Pick<
                Game,
                | 'rating_category'
                | 'white_rating_before'
                | 'white_rating_after'
                | 'black_rating_before'
                | 'black_rating_after'
            >
        > {
    white_accuracy: number | null;
    black_accuracy: number | null;
    created_at: string;
    ended_at: string | null;
    white_id: string;
    black_id: string;
    white: ProfileSummary | null;
    black: ProfileSummary | null;
    /**
     * Opening name and number of moves (Profile.dc.html "Italian Game · 5 min · 34 moves").
     * The games API sends the opening family from the stored moves (F-123; "Other" outside the
     * built-in table) and the move count from the final position (F-124); absent when unknown.
     */
    opening?: string | null;
    move_count?: number | null;
}

/** GET /api/profile/[username]/games body. */
export interface ProfileGamesPayload {
    games?: ProfileGameRow[];
    profileId?: string;
}

export interface OpeningStat {
    name: string;
    games: number;
    /** Whole-number win percentage. */
    winRate: number;
    /** Mean analysed accuracy (%), null when none of these games was analysed. */
    accuracy: number | null;
}

export interface CategoryRecord {
    played: number;
    wins: number;
    losses: number;
    draws: number;
}

/** Derived facts of GET /api/profile/[username]/stats. */
export interface ProfileFacts {
    /** Mean analysed accuracy (%), null when no game was analysed. */
    averageAccuracy: number | null;
    longestWinStreak: number;
    /** Highest opponent rating (at the time) the player beat, over every pool; null without one (F-122). */
    bestWin?: number | null;
    /** English weekday name (UTC), null without games. */
    mostActiveDay: string | null;
}

/** GET /api/profile/[username]/stats. Every field is read defensively by the page. */
export interface ProfileStats {
    total?: number;
    wins?: number;
    losses?: number;
    draws?: number;
    ratings?: Partial<Record<SpeedBucket, number | null>>;
    byCategory?: Partial<Record<SpeedBucket, CategoryRecord>>;
    byColour?: Partial<Record<'white' | 'black', CategoryRecord>>;
    /**
     * Rating per pool: the one before the first recorded game, then the one after each rated game,
     * oldest first (F-121). Empty for a pool without recorded games (games rated before F-120 have none).
     */
    ratingHistory?: Partial<Record<SpeedBucket, number[]>>;
    /** Most played openings, then "Other" (F-123); null when the moves could not be read. */
    openings?: OpeningStat[] | null;
    /** Per pool, the highest opponent rating (at the time) the player beat; null without one (F-122). */
    bestWins?: Partial<Record<SpeedBucket, number | null>>;
    facts?: ProfileFacts;
}
