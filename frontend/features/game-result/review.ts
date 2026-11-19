// Pure helpers for the post-game review page (app/game/[id]/result).
import { Chess } from 'chess.js';
import type { GameWithPlayers, MoveClassification } from '@/types/game';

/** Classification metadata: badge symbol + colour (the `--color-review-*` tokens in app/globals.css). */
export const CLASS_META: Record<string, { sym: string; color: string; label: string }> = {
    Brilliant: { sym: '!!', color: 'var(--color-review-brilliant)', label: 'Brilliant' },
    'Great move': { sym: '!', color: 'var(--color-review-great)', label: 'Great' },
    Best: { sym: '★', color: 'var(--color-review-best)', label: 'Best' },
    Excellent: { sym: '✓', color: 'var(--color-review-excellent)', label: 'Excellent' },
    Good: { sym: '·', color: 'var(--color-review-good)', label: 'Good' },
    Book: { sym: '❉', color: 'var(--color-review-book)', label: 'Book' },
    Inaccuracy: { sym: '?!', color: 'var(--color-review-inaccuracy)', label: 'Inaccuracy' },
    Mistake: { sym: '?', color: 'var(--color-review-mistake)', label: 'Mistake' },
    Miss: { sym: '×', color: 'var(--color-review-miss)', label: 'Miss' },
    Blunder: { sym: '??', color: 'var(--color-review-blunder)', label: 'Blunder' },
};

export const CLASS_ORDER = [
    'Brilliant',
    'Great move',
    'Best',
    'Excellent',
    'Good',
    'Book',
    'Inaccuracy',
    'Mistake',
    'Miss',
    'Blunder',
];

export type ClassificationCounts = Record<string, number>;

const MIN_EST_RATING = 200;
const MAX_EST_RATING = 2900;
const RATING_PER_ACCURACY_POINT = 27;

/** A crude "performance rating" from accuracy, so the review feels chess.com-like. */
export function estRating(acc: number | null) {
    if (acc == null) return null;
    return Math.max(MIN_EST_RATING, Math.min(MAX_EST_RATING, Math.round(acc * RATING_PER_ACCURACY_POINT)));
}

/** Merge both sides' per-move classifications into one ply-ordered list (entries without a numeric ply dropped). */
export function mergeClassifications(game: GameWithPlayers | null): MoveClassification[] {
    if (!game) return [];
    const all = [...(game.white_move_classifications || []), ...(game.black_move_classifications || [])];
    return all.filter((m) => typeof m.ply === 'number').sort((a, b) => a.ply - b.ply);
}

/** FEN for every ply (index 0 = start), replaying UCI moves until the first illegal one. */
export function replayPositions(moves: MoveClassification[]): string[] {
    const c = new Chess();
    const fens = [c.fen()];
    for (const m of moves) {
        try {
            c.move({ from: m.move.slice(0, 2), to: m.move.slice(2, 4), promotion: m.move.slice(4) || 'q' });
        } catch {
            break;
        }
        fens.push(c.fen());
    }
    return fens;
}

/** Count classifications for one side. */
export function tallyClassifications(arr: MoveClassification[] | null | undefined): ClassificationCounts {
    const c: ClassificationCounts = {};
    for (const m of arr || []) c[m.classification] = (c[m.classification] || 0) + 1;
    return c;
}

/** UCI → SAN in the given position, falling back to the UCI string. */
export function uciToPretty(fen: string | undefined, uci: string) {
    if (!fen) return uci;
    try {
        const c = new Chess(fen);
        const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || 'q' });
        return m?.san || uci;
    } catch {
        return uci;
    }
}

/** From/to squares of the played move and of the engine's best move (undefined at the start position). */
export function moveHighlights(curMove: MoveClassification | null) {
    return {
        lastFrom: curMove?.move.slice(0, 2),
        lastTo: curMove?.move.slice(2, 4),
        bestFrom: curMove?.best_move?.slice(0, 2),
        bestTo: curMove?.best_move?.slice(2, 4),
    };
}

/** Display name, then username, then the colour label. */
export function playerName(
    p: { display_name?: string | null; username?: string } | null | undefined,
    fallback: string,
) {
    return p?.display_name || p?.username || fallback;
}
