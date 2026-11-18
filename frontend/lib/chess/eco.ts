// A pure ECO classifier (F-123): the opening of a game from its first moves in SAN, by the
// longest line of the built-in table (openings.data.ts) that the game follows.
import { OPENINGS } from './openings.data';

export interface Opening {
    eco: string;
    /** The family shown on the profile, e.g. "Sicilian Defense". */
    family: string;
    /** The full name, e.g. "Sicilian Defense: Najdorf Variation". */
    name: string;
}

interface Line extends Opening {
    moves: readonly string[];
}

/** SAN without check, mate and annotation marks: "Bb5+" → "Bb5". */
export const normalizeSan = (san: string): string => san.trim().replace(/[+#!?]+$/, '');

const LINES: readonly Line[] = OPENINGS.map(([eco, family, name, moves]) => ({
    eco,
    family,
    name,
    moves: moves.split(' '),
}));

/** The most plies any line of the table needs: reading more of a game cannot change the result. */
export const MAX_BOOK_PLIES = Math.max(...LINES.map((l) => l.moves.length));

function follows(game: readonly string[], line: readonly string[]): boolean {
    return line.length <= game.length && line.every((san, i) => game[i] === san);
}

/** The opening of a game given its moves in order (SAN), or null when no line of the table matches. */
export function classifyOpening(sans: readonly string[]): Opening | null {
    const game = sans.slice(0, MAX_BOOK_PLIES).map(normalizeSan);
    let best: Line | null = null;
    for (const line of LINES) {
        if (follows(game, line.moves) && (!best || line.moves.length > best.moves.length)) best = line;
    }
    return best && { eco: best.eco, family: best.family, name: best.name };
}
