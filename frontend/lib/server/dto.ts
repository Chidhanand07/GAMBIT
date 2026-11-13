import 'server-only';

// Response shapes for the route handlers (NX-04, NX-07 step 4). A DTO is built from an
// allow-list of keys, never by removing known-bad ones: a column that is secret today
// (games.invite_token) or added tomorrow stays on the server unless it is listed here.

type Row = Record<string, unknown>;

/** Columns of `games` the game, result and review pages read. */
const GAME_KEYS = [
    'id',
    'white_id',
    'black_id',
    'time_control',
    'increment',
    'status',
    'result',
    'winner_id',
    'pgn',
    'fen',
    'final_fen',
    'white_clock_ms',
    'black_clock_ms',
    'white_accuracy',
    'black_accuracy',
    'white_move_classifications',
    'black_move_classifications',
    'critical_moments',
    'is_rated',
    'spectator_count',
    'started_at',
    'ended_at',
    'created_at',
] as const;

/** What is shown of a player next to a board. */
const PLAYER_KEYS = [
    'id',
    'username',
    'display_name',
    'avatar_url',
    'rating_rapid',
    'rating_blitz',
    'rating_bullet',
    'rating_classical',
] as const;

/** Columns of `profiles` shown on a profile page (no `sex`, `is_public`, Glicko internals). */
const PUBLIC_PROFILE_KEYS = [
    ...PLAYER_KEYS,
    'bio',
    'country',
    'games_played',
    'wins',
    'losses',
    'draws',
    'accuracy_rating',
    'accuracy_rating_blitz',
    'accuracy_rating_rapid',
    'accuracy_rating_bullet',
    'peak_accuracy_rating',
    'total_moves_analysed',
    'peak_bullet',
    'peak_blitz',
    'peak_rapid',
    'peak_classical',
    'created_at',
] as const;

/** The listed keys that are present on `row`. */
function pick(row: Row, keys: readonly string[]): Row {
    const out: Row = {};
    for (const key of keys) {
        if (key in row) out[key] = row[key];
    }
    return out;
}

/** An embedded player: its public summary, or null/undefined exactly as the row had it. */
function playerSummary(player: unknown): unknown {
    return player && typeof player === 'object' ? pick(player as Row, PLAYER_KEYS) : player;
}

/** A `games` row (optionally with embedded `white` / `black` profiles) as sent to a browser. */
export function toGameDto(row: Row): Row {
    const dto = pick(row, GAME_KEYS);
    if ('white' in row) dto.white = playerSummary(row.white);
    if ('black' in row) dto.black = playerSummary(row.black);
    return dto;
}

/** Another user's `profiles` row as sent to a browser. */
export function toPublicProfileDto(row: Row): Row {
    return pick(row, PUBLIC_PROFILE_KEYS);
}
