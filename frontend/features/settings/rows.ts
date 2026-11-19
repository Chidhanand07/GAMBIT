// The rows of the "Board & pieces" and "Gameplay" cards (design/Settings.dc.html), as data.
import { PIECE_SET_LABELS, PIECE_SETS, type PieceSet } from '@/components/chess/pieceSets';
import { SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { BooleanSetting, UserSettings } from './model';
import { BOARD_THEMES, PIECE_ANIMATIONS, TIME_CONTROLS } from './model';

export type ChoiceSetting = 'boardTheme' | 'pieceSet' | 'pieceAnimation' | 'defaultTimeControl';

export type SettingRowDef =
    | { kind: 'switch'; key: BooleanSetting; label: string; hint: string }
    | { kind: 'choice'; key: ChoiceSetting; label: string; hint: string; options: { id: string; label: string }[] };

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const options = (ids: readonly string[], label: (id: string) => string = capitalise) =>
    ids.map((id) => ({ id, label: label(id) }));

export const BOARD_ROWS: SettingRowDef[] = [
    {
        kind: 'choice',
        key: 'boardTheme',
        label: 'Board theme',
        hint: 'Colours of the squares.',
        options: options(BOARD_THEMES),
    },
    {
        kind: 'choice',
        key: 'pieceSet',
        label: 'Piece set',
        hint: 'Style of the pieces on the board.',
        options: options(PIECE_SETS, (id) => PIECE_SET_LABELS[id as PieceSet]),
    },
    {
        kind: 'switch',
        key: 'showCoordinates',
        label: 'Show coordinates',
        hint: 'Files a to h and ranks 1 to 8 on the board edge.',
    },
    {
        kind: 'switch',
        key: 'highlightLegalMoves',
        label: 'Highlight legal moves',
        hint: 'Dots on squares a piece can move to.',
    },
    {
        kind: 'switch',
        key: 'highlightLastMove',
        label: 'Highlight last move',
        hint: 'Tint the squares of the previous move.',
    },
    {
        kind: 'choice',
        key: 'pieceAnimation',
        label: 'Piece animation',
        hint: 'Slide pieces instead of jumping.',
        options: options(PIECE_ANIMATIONS),
    },
    { kind: 'switch', key: 'moveSounds', label: 'Move sounds', hint: 'A click when a move is made.' },
];

export const GAMEPLAY_ROWS: SettingRowDef[] = [
    {
        kind: 'choice',
        key: 'defaultTimeControl',
        label: 'Default time control',
        hint: 'Pre-selected when you open the lobby.',
        options: options(TIME_CONTROLS, (id) => SPEED_BUCKET_LABELS[id as keyof typeof SPEED_BUCKET_LABELS]),
    },
    { kind: 'switch', key: 'autoQueen', label: 'Auto-queen', hint: 'Promote pawns to a queen automatically.' },
    {
        kind: 'switch',
        key: 'confirmResignDraw',
        label: 'Confirm resign and draw',
        hint: 'Ask before you resign or offer a draw.',
    },
];

/** The current value of a choice row, as its option id. */
export const choiceValue = (settings: UserSettings, key: ChoiceSetting): string => settings[key];
