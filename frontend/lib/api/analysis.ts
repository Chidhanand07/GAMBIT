// Client-side fetch helper for the analysis board's engine panel.

/**
 * Body returned by the realtime server's POST /api/analysis/engine.
 * Rendered without validation: on an engine error the body may lack these fields.
 */
export interface EngineAnalysis {
    /** Pawns, from White's point of view. */
    score: number;
    /** UCI. */
    best_move: string;
    /** Space-separated UCI principal variation. */
    pv?: string;
}

/** Search depth the analysis page always requests (shown as "d18"). */
export const ANALYSIS_DEPTH = 18;

/**
 * POST {fen, depth: 18} to the realtime server's /api/analysis/engine.
 * The response status is not checked; the JSON body is returned as-is.
 */
export async function requestEngineAnalysis(fen: string): Promise<EngineAnalysis> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'}/api/analysis/engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth: ANALYSIS_DEPTH }),
    });
    return res.json();
}
