// MAVERICK difficulties and "Play as" sides (design/Main.dc.html `playVals()`), shown by the
// lobby's setup card and the /offline setup screen.
import type { ColorChoice, Difficulty } from './types';

export interface DifficultyChoice {
    id: Difficulty;
    name: string;
    note: string;
    icon: string;
}

/** MAVERICK levels: the ids are the engine levels the /offline flow sends to /api/maverick-move. */
export const DIFFICULTY_CHOICES: readonly DifficultyChoice[] = [
    {
        id: 'easy',
        name: 'Easy',
        note: 'Plays your style and makes real mistakes.',
        icon: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    },
    {
        id: 'medium',
        name: 'Medium',
        note: 'Plays like you, but avoids blunders.',
        icon: 'M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V18h8v-3.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7zM9 21h6',
    },
    {
        id: 'hard',
        name: 'Hard',
        note: 'Your style, sharpened by Stockfish.',
        icon: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
    },
];

const TEXT_STYLE = '︎';

export const SIDE_CHOICES: readonly { id: ColorChoice; name: string; glyph: string }[] = [
    { id: 'w', name: 'White', glyph: `♔${TEXT_STYLE}` },
    { id: 'random', name: 'Random', glyph: '⚄' },
    { id: 'b', name: 'Black', glyph: `♚${TEXT_STYLE}` },
];
