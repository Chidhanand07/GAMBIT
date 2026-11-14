import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@/types/game';
import { participantFilter } from './filters';

const ACTIVE_GAME_COLUMNS = 'id, white_id, black_id, time_control, status, started_at, clock_deadline';
// Whitespace kept byte-for-byte from the original handlers' select strings.
const GAME_WITH_PLAYERS_COLUMNS = `
            *,
            white:profiles!games_white_id_fkey(id, username, display_name, avatar_url, rating_rapid, rating_blitz, rating_bullet, rating_classical),
            black:profiles!games_black_id_fkey(id, username, display_name, avatar_url, rating_rapid, rating_blitz, rating_bullet, rating_classical)
        `;
const HISTORY_COLUMNS = `
            id, time_control, status, result, winner_id,
            white_accuracy, black_accuracy, created_at, ended_at,
            white_id, black_id,
            white:profiles!games_white_id_fkey(username, display_name, rating_rapid, rating_blitz, rating_bullet, rating_classical),
            black:profiles!games_black_id_fkey(username, display_name, rating_rapid, rating_blitz, rating_bullet, rating_classical)
        `;
const FINISHED_STATUSES = ['completed', 'finished', 'ended'];

/** A deadline that passed more than this long ago means the game timed out while the server was down. */
const DEADLINE_GRACE_MS = 10_000;
/** An active game with no activity (a move, or its start when it has no moves) for this long is stale. */
const STALE_NO_MOVES_MS = 2 * 60 * 60 * 1000;

/** Fields a player may PATCH on a game (prevents status/winner tampering). */
const CLIENT_WRITABLE_FIELDS = ['draw_offer', 'rematch_requested'];

type ActiveGameRow = Pick<Game, 'id' | 'started_at'> & {
    clock_deadline?: string | null;
};

/** The user's most recently started active game, if any. */
export function findActiveGame(admin: SupabaseClient, userId: string) {
    return admin
        .from('games')
        .select(ACTIVE_GAME_COLUMNS)
        .or(participantFilter(userId))
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
}

/** `created_at` of a game's newest move (the server inserts one `moves` row per move); null data when it has none. */
export function findLastMove(admin: SupabaseClient, gameId: string) {
    return admin
        .from('moves')
        .select('created_at')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
}

/** True when the clock deadline passed more than the grace period ago (the game timed out while the server was down). */
function isPastClockDeadline(game: ActiveGameRow, now: number): boolean {
    if (!game.clock_deadline) return false;
    return now > new Date(game.clock_deadline).getTime() + DEADLINE_GRACE_MS;
}

/** Milliseconds since `iso`; null when there is no timestamp to measure from. */
function idleMs(iso: string | null | undefined, now: number): number | null {
    return iso ? now - new Date(iso).getTime() : null;
}

/**
 * True when an active game survived a server restart: its clock deadline passed more than 10 s
 * ago, or its last activity is more than two hours old. Last activity is the newest move, or the
 * start of a game that has no moves. The moves are read (one query) only for a game that started
 * more than two hours ago; if that read fails the game is kept, because abandoning it cannot be undone.
 */
export async function isStaleActiveGame(admin: SupabaseClient, game: ActiveGameRow): Promise<boolean> {
    const now = Date.now();
    if (isPastClockDeadline(game, now)) return true;

    const sinceStart = idleMs(game.started_at, now);
    if (sinceStart !== null && sinceStart <= STALE_NO_MOVES_MS) return false;

    const { data: lastMove, error } = await findLastMove(admin, game.id);
    if (error) return false;

    const sinceActivity = idleMs(lastMove?.created_at, now) ?? sinceStart;
    return sinceActivity !== null && sinceActivity > STALE_NO_MOVES_MS;
}

/** Marks a still-active game as completed/abandoned (no winner). */
export function abandonActiveGame(admin: SupabaseClient, gameId: string) {
    return admin
        .from('games')
        .update({
            status: 'completed',
            result: 'abandoned',
            ended_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('status', 'active');
}

/** Game row with both players' profiles embedded. */
export function getGameWithPlayers(admin: SupabaseClient, gameId: string) {
    return admin.from('games').select(GAME_WITH_PLAYERS_COLUMNS).eq('id', gameId).single();
}

/** `white_id` / `black_id` of a game. */
export function getGameParticipants(admin: SupabaseClient, gameId: string) {
    return admin.from('games').select('white_id, black_id').eq('id', gameId).maybeSingle();
}

/** Only the client-writable fields of a PATCH body. */
export function pickClientWritableFields(body: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(body).filter(([k]) => CLIENT_WRITABLE_FIELDS.includes(k)));
}

/** Applies `fields` to a game and returns the updated row. */
export function updateGame(admin: SupabaseClient, gameId: string, fields: Record<string, unknown>) {
    return admin.from('games').update(fields).eq('id', gameId).select().single();
}

/** Inserts a game row and returns it. */
export function insertGame(admin: SupabaseClient, row: Record<string, unknown>) {
    return admin.from('games').insert(row).select().single();
}

/** Stores a game's invite (service-role only table; RLS on, no policies). */
export function insertGameInvite(
    admin: SupabaseClient,
    invite: { game_id: string; token: string; expires_at: string },
) {
    return admin.from('game_invites').insert(invite);
}

/** Deletes a game by id (undoes a private game whose invite could not be stored). */
export function deleteGame(admin: SupabaseClient, gameId: string) {
    return admin.from('games').delete().eq('id', gameId);
}

/** One page of a player's finished games, newest first. */
export function listFinishedGamesPage(admin: SupabaseClient, profileId: string, offset: number, limit: number) {
    return admin
        .from('games')
        .select(HISTORY_COLUMNS)
        .or(participantFilter(profileId))
        .in('status', FINISHED_STATUSES)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
}

/** Every finished game of a player (columns needed for the per-category stats). */
export function listFinishedGamesForStats(admin: SupabaseClient, profileId: string) {
    return admin
        .from('games')
        .select('id, time_control, winner_id, result, white_id, black_id')
        .or(participantFilter(profileId))
        .in('status', FINISHED_STATUSES);
}
