// Time-control vocabulary shared by the lobby, game, profile and API routes.

/**
 * A time control as stored in `games.time_control` (TEXT) and sent over the socket.
 * Usually the base minutes ("1", "3", "10", "30", "1440"); the lobby's custom
 * mode sends "<min>+<inc>" (e.g. "5+3"). Parsed with `parseInt`, so anything
 * after the leading digits is ignored by minute-based helpers.
 */
export type TimeControl = string;

/** Rating pool / speed category of a time control. */
export type SpeedBucket = 'bullet' | 'blitz' | 'rapid' | 'classical';

/** `profiles` rating column for a speed bucket. */
export type RatingField = `rating_${SpeedBucket}`;

/** Lobby picker ids: the four buckets plus the two lobby-only modes. */
export type LobbyTimeControlId = SpeedBucket | 'custom' | 'daily';
