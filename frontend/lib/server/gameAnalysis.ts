import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisPly, AnalysisSide, GameAnalysis } from '@/types/gameAnalysis';

// A finished game for the analysis page (ADR F-134). Runs on the admin client after the route
// verified the caller: a private game (one with a `game_invites` row, service-role only) is
// shown to its two players only, and only these allow-listed fields leave the server (NX-04).

const PLAYER = 'username, display_name';
const ANALYSIS_COLUMNS = `id, status, white_id, black_id, white_accuracy, black_accuracy, white_move_classifications, black_move_classifications, white:profiles!games_white_id_fkey(${PLAYER}), black:profiles!games_black_id_fkey(${PLAYER})`;
const FINISHED_STATUS = 'completed';

interface AnalysisRow {
    id: string;
    status: string;
    white_id: string | null;
    black_id: string | null;
    white_accuracy: number | null;
    black_accuracy: number | null;
    white_move_classifications: unknown;
    black_move_classifications: unknown;
    white: unknown;
    black: unknown;
}

export type GameAnalysisResult =
    { ok: true; data: GameAnalysis } | { ok: false; status: 404 | 409 | 500; error: string };

const NOT_FOUND = { ok: false, status: 404, error: 'Game not found' } as const;
const NOT_FINISHED = { ok: false, status: 409, error: 'This game is still being played' } as const;
const FAILED = { ok: false, status: 500, error: 'Could not load the game' } as const;

function nameOf(profile: unknown): string | null {
    const p = profile as { username?: unknown; display_name?: unknown } | null;
    if (typeof p?.display_name === 'string' && p.display_name) return p.display_name;
    return typeof p?.username === 'string' ? p.username : null;
}

/** Only the fields the page shows, from the engine's stored entries; malformed ones are dropped. */
export function toPlies(value: unknown): AnalysisPly[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((m) => m && typeof m.ply === 'number' && typeof m.san === 'string')
        .map((m) => ({
            ply: m.ply,
            san: m.san,
            classification: typeof m.classification === 'string' ? m.classification : '',
            accuracy: typeof m.accuracy === 'number' ? m.accuracy : 0,
        }));
}

/** "1. e4 e5 2. Nf3" from the moves in order. */
export function movetext(sans: readonly string[]): string {
    return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
}

function side(row: AnalysisRow, color: 'white' | 'black'): AnalysisSide {
    return {
        name: nameOf(row[color]),
        accuracy: typeof row[`${color}_accuracy`] === 'number' ? row[`${color}_accuracy`] : null,
        moves: toPlies(row[`${color}_move_classifications`]),
    };
}

/** The moves in order: the reviewed ones when there is a review, else the `moves` table. */
async function gameSans(admin: SupabaseClient, gameId: string, reviewed: AnalysisPly[]): Promise<string[] | null> {
    if (reviewed.length > 0) return [...reviewed].sort((a, b) => a.ply - b.ply).map((m) => m.san);
    const { data, error } = await admin.from('moves').select('san').eq('game_id', gameId).order('move_number');
    if (error) return null;
    return (data ?? []).map((m: { san: string }) => m.san);
}

/** Whether `userId` may see `row`: a player always; anyone else only if the game is not private. */
async function maySee(admin: SupabaseClient, row: AnalysisRow, userId: string): Promise<boolean | null> {
    if (row.white_id === userId || row.black_id === userId) return true;
    const { data, error } = await admin.from('game_invites').select('game_id').eq('game_id', row.id).maybeSingle();
    if (error) return null;
    return !data;
}

/**
 * A finished game with its moves and stored review for `userId`. Not found (404) also covers
 * a private game the caller does not play in, so its existence is not revealed; a game still
 * in play is 409 (no engine help mid-game). A failed private-game check denies (fail closed).
 */
export async function loadGameAnalysis(
    admin: SupabaseClient,
    gameId: string,
    userId: string,
): Promise<GameAnalysisResult> {
    const { data, error } = await admin.from('games').select(ANALYSIS_COLUMNS).eq('id', gameId).maybeSingle();
    if (error) return FAILED;
    if (!data) return NOT_FOUND;
    const row = data as AnalysisRow;
    const allowed = await maySee(admin, row, userId);
    if (allowed === null) return FAILED;
    if (!allowed) return NOT_FOUND;
    if (row.status !== FINISHED_STATUS) return NOT_FINISHED;

    const white = side(row, 'white');
    const black = side(row, 'black');
    const sans = await gameSans(admin, row.id, [...white.moves, ...black.moves]);
    if (sans === null) return FAILED;
    return { ok: true, data: { id: row.id, pgn: movetext(sans), white, black } };
}
