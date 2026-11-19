// GET /api/games/live: active public games for the lobby's "Live games" card.
import type { SpeedBucket, TimeControl } from './timeControl';

/** One side of a live game, with the rating of the game's category. */
export interface LiveGamePlayer {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    /** Rounded rating for the game's category; null when the profile has none. */
    rating: number | null;
}

export interface LiveGame {
    id: string;
    time_control: TimeControl;
    category: SpeedBucket;
    /** Full-move number of the current position (1 before any move). */
    move_number: number;
    started_at: string | null;
    white: LiveGamePlayer;
    black: LiveGamePlayer;
}
