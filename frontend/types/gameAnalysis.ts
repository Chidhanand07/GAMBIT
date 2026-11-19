// GET /api/games/[id]/analysis: a finished game for /analysis?game=<id> (ADR F-134).

/** One reviewed ply as the analysis page needs it (from the engine's stored review). */
export interface AnalysisPly {
    ply: number;
    san: string;
    classification: string;
    accuracy: number;
}

export interface AnalysisSide {
    /** Display name, else username; null when the profile is gone. */
    name: string | null;
    /** Mean move accuracy (%), null until the engine has reviewed the game. */
    accuracy: number | null;
    /** The side's reviewed moves; empty until reviewed. */
    moves: AnalysisPly[];
}

export interface GameAnalysis {
    id: string;
    /** The game's moves as PGN movetext ("1. e4 e5 2. Nf3"); empty for a game without moves. */
    pgn: string;
    white: AnalysisSide;
    black: AnalysisSide;
}
