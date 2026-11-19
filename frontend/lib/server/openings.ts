import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyOpening, MAX_BOOK_PLIES, type Opening } from '@/lib/chess/eco';
import { playerOutcome, type OutcomeRow } from '@/lib/chess/gameOutcome';
import type { OpeningStat } from '@/types/profilePage';

// Openings of a player's games (Profile.dc.html "Openings" table and the Games-tab rows, F-123):
// the first moves come from the `moves` rows the game server stores, the name from the built-in
// classifier (lib/chess/eco).

/** PostgREST returns at most this many rows per request (Supabase's default `max_rows`). */
const MAX_ROWS_PER_REQUEST = 1000;
const GAMES_PER_REQUEST = Math.floor(MAX_ROWS_PER_REQUEST / MAX_BOOK_PLIES);
const PERCENT = 100;
/** Rows of the table: the most played openings, then "Other" for the rest. */
const MAX_OPENING_ROWS = 5;
export const OTHER_OPENING = 'Other';

interface MoveRow {
    game_id: string;
    move_number: number;
    san: string;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** The book moves (first MAX_BOOK_PLIES plies, in order) of some games, one request per chunk. */
function listBookMoves(admin: SupabaseClient, gameIds: string[]) {
    return admin
        .from('moves')
        .select('game_id, move_number, san')
        .in('game_id', gameIds)
        .lte('move_number', MAX_BOOK_PLIES)
        .order('move_number', { ascending: true });
}

/** The moves up to the first gap (a missing row ends what can be read as the game's opening). */
function leadingMoves(list: readonly (string | undefined)[]): string[] {
    const out: string[] = [];
    for (const san of list) {
        if (!san) break;
        out.push(san);
    }
    return out;
}

/**
 * The opening of each game that has stored moves (null: moves that match no line of the table).
 * Games without moves are absent. Null when a read failed, so no partial table is shown.
 */
export async function openingsOfGames(
    admin: SupabaseClient,
    gameIds: readonly string[],
): Promise<Map<string, Opening | null> | null> {
    const results = await Promise.all(chunks(gameIds, GAMES_PER_REQUEST).map((ids) => listBookMoves(admin, ids)));
    if (results.some((r) => r.error)) return null;
    const sans = new Map<string, string[]>();
    for (const row of results.flatMap((r) => (r.data ?? []) as MoveRow[])) {
        const list = sans.get(row.game_id) ?? [];
        list[row.move_number - 1] = row.san;
        sans.set(row.game_id, list);
    }
    return new Map([...sans].map(([id, list]) => [id, classifyOpening(leadingMoves(list))]));
}

export interface OpeningGameRow extends OutcomeRow {
    id: string;
    white_accuracy?: number | null;
    black_accuracy?: number | null;
}

interface Tally {
    games: number;
    wins: number;
    accuracies: number[];
}

function tally(games: readonly OpeningGameRow[], openings: Map<string, Opening | null>, profileId: string) {
    const byName = new Map<string, Tally>();
    for (const game of games) {
        const outcome = playerOutcome(game, profileId);
        if (outcome === 'aborted' || !openings.has(game.id)) continue;
        const name = openings.get(game.id)?.family ?? OTHER_OPENING;
        const t = byName.get(name) ?? { games: 0, wins: 0, accuracies: [] };
        t.games++;
        if (outcome === 'win') t.wins++;
        const accuracy = game.white_id === profileId ? game.white_accuracy : game.black_accuracy;
        if (typeof accuracy === 'number') t.accuracies.push(accuracy);
        byName.set(name, t);
    }
    return byName;
}

function merge(a: Tally, b: Tally): Tally {
    return { games: a.games + b.games, wins: a.wins + b.wins, accuracies: [...a.accuracies, ...b.accuracies] };
}

const toStat = (name: string, t: Tally): OpeningStat => ({
    name,
    games: t.games,
    winRate: Math.round((t.wins / t.games) * PERCENT),
    accuracy: t.accuracies.length ? Math.round(t.accuracies.reduce((s, a) => s + a, 0) / t.accuracies.length) : null,
});

/**
 * The player's openings, most played first (ties by name), at most MAX_OPENING_ROWS rows: past
 * that, the least played ones are counted in "Other", which always comes last.
 */
export function openingStats(
    games: readonly OpeningGameRow[],
    openings: Map<string, Opening | null>,
    profileId: string,
): OpeningStat[] {
    const byName = tally(games, openings, profileId);
    let other = byName.get(OTHER_OPENING) ?? null;
    byName.delete(OTHER_OPENING);
    const named = [...byName].sort(([a, x], [b, y]) => y.games - x.games || a.localeCompare(b));
    const room = other ? MAX_OPENING_ROWS - 1 : MAX_OPENING_ROWS;
    const keep = named.length > room ? named.slice(0, MAX_OPENING_ROWS - 1) : named;
    for (const [, t] of named.slice(keep.length)) other = other ? merge(other, t) : t;
    const rows = keep.map(([name, t]) => toStat(name, t));
    return other ? [...rows, toStat(OTHER_OPENING, other)] : rows;
}
