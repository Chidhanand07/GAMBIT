// Client-side fetch helper for the analysis board's engine panel.
import { z } from 'zod';

/** An engine evaluation as the analysis page shows it. */
export interface EngineAnalysis {
    /** Pawns, from White's point of view. A mate is ±MATE_SCORE_PAWNS so the eval bar fills. */
    score: number;
    /** Moves to mate, signed from White's point of view (negative: Black mates); null for a centipawn score. */
    mate: number | null;
    /** UCI. */
    best_move: string;
    /** Space-separated UCI principal variation, when the engine sends one. */
    pv?: string;
}

/** Search depth the analysis page always requests (shown as "d18"). */
export const ANALYSIS_DEPTH = 18;

const CENTIPAWNS_PER_PAWN = 100;
/** Score used for a forced mate: far beyond what the eval bar shows. */
export const MATE_SCORE_PAWNS = 100;

/**
 * Body of the realtime server's POST /api/analysis/engine: the chess engine's /analyze
 * response (chess-engine/services/analysis.py analyse_position), passed through.
 * `evaluation.value` is centipawns or moves to mate, from White's point of view.
 */
const engineBodySchema = z.object({
    best_move: z.string().min(1),
    evaluation: z.object({ type: z.enum(['cp', 'mate']), value: z.number().finite() }),
    pv: z.string().optional(),
});

function toAnalysis(body: z.infer<typeof engineBodySchema>): EngineAnalysis {
    const { type, value } = body.evaluation;
    const analysis: EngineAnalysis =
        type === 'mate'
            ? { score: Math.sign(value) * MATE_SCORE_PAWNS, mate: value, best_move: body.best_move }
            : { score: value / CENTIPAWNS_PER_PAWN, mate: null, best_move: body.best_move };
    return body.pv ? { ...analysis, pv: body.pv } : analysis;
}

/**
 * POST {fen, depth: 18} to the realtime server's /api/analysis/engine. Rejects on a non-OK
 * status (400 bad FEN, 502 engine down, 503 busy) and on a body without a readable
 * evaluation, so the page can show an error instead of a 0.0 evaluation (F14).
 */
export async function requestEngineAnalysis(fen: string): Promise<EngineAnalysis> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'}/api/analysis/engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth: ANALYSIS_DEPTH }),
    });
    if (!res.ok) throw new Error(`engine request failed: ${res.status}`);
    const parsed = engineBodySchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('engine response has no evaluation');
    return toAnalysis(parsed.data);
}
