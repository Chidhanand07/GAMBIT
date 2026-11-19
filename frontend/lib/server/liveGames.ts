import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { categoryOf, timeControlOf } from '@/lib/chess/timeControl';
import type { LiveGame, LiveGamePlayer } from '@/types/liveGame';
import { liveDeadlineFilter } from './filters';
import { listSpectatorBlockers } from './preferences';

// Active public games for the lobby (GET /api/games/live). A game is private when it has a
// row in `game_invites` (service-role only), so this runs on the admin client with explicit
// column lists, and only these columns ever leave the server (allow-list DTO, NX-04).

const PLAYER_COLUMNS =
    'username, display_name, avatar_url, rating_bullet, rating_blitz, rating_rapid, rating_classical';
const LIVE_COLUMNS = `id, time_control, fen, started_at, white_id, black_id, white:profiles!games_white_id_fkey(${PLAYER_COLUMNS}), black:profiles!games_black_id_fkey(${PLAYER_COLUMNS})`;

/** Candidates read per requested game, so private games filtered out afterwards rarely shorten the list. */
const CANDIDATE_FACTOR = 2;
/** FEN field holding the full-move number. */
const FEN_FULLMOVE_FIELD = 5;

type PlayerRow = Record<string, unknown> & { username?: unknown; display_name?: unknown; avatar_url?: unknown };

export interface LiveGameRow {
    id: string;
    white_id?: string | null;
    black_id?: string | null;
    time_control: string;
    fen: string | null;
    started_at: string | null;
    white: unknown;
    black: unknown;
}

export type LiveGamesResult = { data: LiveGame[]; error: null } | { data: null; error: { message: string } };

/** Full-move number of a FEN; 1 for a missing or malformed one (the game has not started moving). */
export function moveNumberFromFen(fen: string | null): number {
    const field = fen?.trim().split(/\s+/)[FEN_FULLMOVE_FIELD];
    const n = field ? Number.parseInt(field, 10) : NaN;
    return Number.isInteger(n) && n > 0 ? n : 1;
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function toPlayer(row: unknown, ratingField: string): LiveGamePlayer | null {
    if (!row || typeof row !== 'object') return null;
    const p = row as PlayerRow;
    if (typeof p.username !== 'string') return null;
    const rating = p[ratingField];
    return {
        username: p.username,
        display_name: textOrNull(p.display_name),
        avatar_url: textOrNull(p.avatar_url),
        rating: typeof rating === 'number' ? Math.round(rating) : null,
    };
}

/** A games row as the lobby's DTO; null when a side has no profile. */
export function toLiveGame(row: LiveGameRow): LiveGame | null {
    const category = categoryOf(timeControlOf(row.time_control));
    const field = `rating_${category}`;
    const white = toPlayer(row.white, field);
    const black = toPlayer(row.black, field);
    if (!white || !black) return null;
    return {
        id: row.id,
        time_control: row.time_control,
        category,
        move_number: moveNumberFromFen(row.fen),
        started_at: row.started_at,
        white,
        black,
    };
}

function listActiveGames(admin: SupabaseClient, limit: number, now: Date) {
    return admin
        .from('games')
        .select(LIVE_COLUMNS)
        .eq('status', 'active')
        .or(liveDeadlineFilter(now))
        .order('started_at', { ascending: false })
        .limit(limit * CANDIDATE_FACTOR);
}

/** Ids among `gameIds` that are private (have an invite). */
function listInvitedGameIds(admin: SupabaseClient, gameIds: string[]) {
    return admin.from('game_invites').select('game_id').in('game_id', gameIds);
}

/** The distinct player ids of `rows`. */
const playerIds = (rows: LiveGameRow[]): string[] => [
    ...new Set(rows.flatMap((r) => [r.white_id, r.black_id]).filter((id): id is string => !!id)),
];

/** Whether a player of `row` is among `blocked`. */
const hasBlocker = (row: LiveGameRow, blocked: Set<string>): boolean =>
    [row.white_id, row.black_id].some((id) => !!id && blocked.has(id));

/**
 * Ids of the games among `rows` a viewer may not see: private ones (an invite exists) and those
 * with a player who turned "Allow spectators" off (ADR F-140), or the error of a failed check.
 */
async function hiddenGameIds(
    admin: SupabaseClient,
    rows: LiveGameRow[],
): Promise<{ hidden: Set<string> } | { error: { message: string } }> {
    const players = playerIds(rows);
    const [invites, blockers] = await Promise.all([
        listInvitedGameIds(
            admin,
            rows.map((r) => r.id),
        ),
        players.length > 0 ? listSpectatorBlockers(admin, players) : Promise.resolve({ data: [], error: null }),
    ]);
    const failed = invites.error ?? blockers.error;
    if (failed) return { error: failed };
    const blocked = new Set((blockers.data ?? []).map((b: { user_id: string }) => b.user_id));
    const hidden = new Set((invites.data ?? []).map((i: { game_id: string }) => i.game_id));
    for (const r of rows) if (hasBlocker(r, blocked)) hidden.add(r.id);
    return { hidden };
}

/**
 * Up to `limit` active public games, newest first. If the private-game or spectator check fails,
 * nothing is listed (fail closed: a private or no-spectators game must never be shown).
 */
export async function listLiveGames(admin: SupabaseClient, limit: number, now = new Date()): Promise<LiveGamesResult> {
    const games = await listActiveGames(admin, limit, now);
    if (games.error) return { data: null, error: games.error };
    const rows = (games.data ?? []) as LiveGameRow[];
    if (rows.length === 0) return { data: [], error: null };

    const visibility = await hiddenGameIds(admin, rows);
    if ('error' in visibility) return { data: null, error: visibility.error };
    const { hidden } = visibility;

    const live = rows
        .filter((r) => !hidden.has(r.id))
        .map(toLiveGame)
        .filter((g): g is LiveGame => g !== null);
    return { data: live.slice(0, limit), error: null };
}
