// The user's play preferences (design/Settings.dc.html "Board & pieces" and "Gameplay"): the
// shape, defaults and a defensive parse of whatever a SettingsStore hands back.
import type { BoardTheme } from '@/components/chess/boardStyles';
import { DEFAULT_PIECE_SET, PIECE_SETS, type PieceSet } from '@/components/chess/pieceSets';
import type { SpeedBucket } from '@/types/timeControl';

export type PieceAnimation = 'off' | 'fast' | 'smooth';

export interface UserSettings {
    boardTheme: BoardTheme;
    /** "Piece set": Gambit, Classic or Line art (ADR F-147). */
    pieceSet: PieceSet;
    showCoordinates: boolean;
    highlightLegalMoves: boolean;
    highlightLastMove: boolean;
    pieceAnimation: PieceAnimation;
    moveSounds: boolean;
    /** Pre-selected in the lobby. */
    defaultTimeControl: SpeedBucket;
    autoQueen: boolean;
    confirmResignDraw: boolean;
    /** Opponents may ask to take back a move (declared to the game server per game, ADR F-152). */
    allowTakebacks: boolean;
}

/**
 * The mockups' defaults. Coordinates are off: Game.dc.html and Analysis.dc.html draw their boards
 * without them, and that wins over the Settings mockup's sample row (F-100).
 */
export const DEFAULT_SETTINGS: Readonly<UserSettings> = {
    boardTheme: 'maple',
    pieceSet: DEFAULT_PIECE_SET,
    showCoordinates: false,
    highlightLegalMoves: true,
    highlightLastMove: true,
    pieceAnimation: 'smooth',
    moveSounds: true,
    defaultTimeControl: 'blitz',
    autoQueen: true,
    confirmResignDraw: true,
    allowTakebacks: false,
};

export const BOARD_THEMES: readonly BoardTheme[] = ['maple', 'green', 'slate', 'walnut'];
export const PIECE_ANIMATIONS: readonly PieceAnimation[] = ['off', 'fast', 'smooth'];
export const TIME_CONTROLS: readonly SpeedBucket[] = ['bullet', 'blitz', 'rapid', 'classical'];

/** Slide duration per animation setting (Settings.dc.html: 0 / 150ms; "Smooth" is the board's 420ms). */
export const PIECE_SLIDE_MS: Record<PieceAnimation, number> = { off: 0, fast: 150, smooth: 420 };

export type BooleanSetting = {
    [K in keyof UserSettings]: UserSettings[K] extends boolean ? K : never;
}[keyof UserSettings];

const BOOLEAN_KEYS: readonly BooleanSetting[] = [
    'showCoordinates',
    'highlightLegalMoves',
    'highlightLastMove',
    'moveSounds',
    'autoQueen',
    'confirmResignDraw',
    'allowTakebacks',
];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A stored value read back as settings: unknown keys dropped, bad values replaced by defaults. */
export function parseSettings(raw: unknown): UserSettings {
    const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out: UserSettings = {
        ...DEFAULT_SETTINGS,
        boardTheme: pick(src.boardTheme, BOARD_THEMES, DEFAULT_SETTINGS.boardTheme),
        pieceSet: pick(src.pieceSet, PIECE_SETS, DEFAULT_SETTINGS.pieceSet),
        pieceAnimation: pick(src.pieceAnimation, PIECE_ANIMATIONS, DEFAULT_SETTINGS.pieceAnimation),
        defaultTimeControl: pick(src.defaultTimeControl, TIME_CONTROLS, DEFAULT_SETTINGS.defaultTimeControl),
    };
    for (const key of BOOLEAN_KEYS) {
        if (typeof src[key] === 'boolean') out[key] = src[key];
    }
    return out;
}

/** What a board needs from the settings (props of components/chess/Board plus the move-sound switch). */
export interface BoardPrefs {
    theme: BoardTheme;
    animate: boolean;
    /** Slide duration in ms (0 when animation is off). */
    slideMs: number;
    showCoordinates: boolean;
    highlightLegalMoves: boolean;
    highlightLastMove: boolean;
    sound: boolean;
}

export function boardPrefsOf(s: UserSettings): BoardPrefs {
    return {
        theme: s.boardTheme,
        animate: s.pieceAnimation !== 'off',
        slideMs: PIECE_SLIDE_MS[s.pieceAnimation],
        showCoordinates: s.showCoordinates,
        highlightLegalMoves: s.highlightLegalMoves,
        highlightLastMove: s.highlightLastMove,
        sound: s.moveSounds,
    };
}
