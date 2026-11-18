// Typed reducer for the live game page (replaces the page's individual useState calls).
// Every action mirrors one group of setState calls in the legacy page; fields an action
// does not mention keep their identity so effects keyed on them re-run at the same moments.
import { Chess, type Square } from 'chess.js';
import type { GameWithPlayers, PlayerColor, SeatColor } from '@/types/game';
import {
    clearedRequests,
    createInitialRequests,
    requestHandlers,
    type RequestsAction,
    type RequestsState,
} from './requests';

export interface MovePair {
    from: Square;
    to: Square;
}

/** The position a takeback returned to (ADR F-152), from the server's `takeback_applied`. */
export interface RestoredPosition {
    fen: string;
    fens: string[];
    sans: string[];
    lastMove: MovePair | null;
    whiteMs: number;
    blackMs: number;
    clockActive: boolean;
}

export interface GameOverInfo {
    result: string;
    reason: string;
}

export interface ChatLine {
    from: string;
    text: string;
    /** The sender's id as verified by the server (absent on older payloads). */
    fromUserId?: string;
}

export type RematchState = 'idle' | 'sent' | 'received' | 'declined';
/** The open confirmation dialog (Game.dc.html Draw / Resign), if any. */
export type ConfirmDialog = 'draw' | 'resign' | null;

export interface GameState extends RequestsState {
    fen: string;
    gameData: GameWithPlayers | null;
    myColor: SeatColor;
    selectedSq: Square | null;
    legalDests: Square[];
    lastMove: MovePair | null;
    moveList: string[];
    fenSnapshots: string[];
    /** null = live position. */
    viewIndex: number | null;
    flipped: boolean;
    chatMsg: string;
    chatLog: ChatLine[];
    connected: boolean;
    pendingPromotion: MovePair | null;
    whiteRatingChange: number | null;
    blackRatingChange: number | null;
    /** Seconds. */
    whiteTime: number;
    blackTime: number;
    gameOver: GameOverInfo | null;
    rematchState: RematchState;
    rematchFromUser: string;
    confirm: ConfirmDialog;
    /** Focus mode: the board centred, the side panels hidden (Game.dc.html). */
    focus: boolean;
    /** Set by the server after the first move; the display clock only ticks while true. */
    clockActive: boolean;
    /** Viewers watching ("N watching"); null until the server has said (F-130). */
    spectators: number | null;
}

const DEFAULT_CLOCK_SECONDS = 600;
const MS_PER_SECOND = 1000;
/** clock_sync overrides the local clock only when it has drifted further than this from the server. */
export const CLOCK_SYNC_TOLERANCE_MS = 500;

export function createInitialGameState(): GameState {
    return {
        fen: new Chess().fen(),
        gameData: null,
        myColor: 'spectator',
        selectedSq: null,
        legalDests: [],
        lastMove: null,
        moveList: [],
        fenSnapshots: [],
        viewIndex: null,
        flipped: false,
        chatMsg: '',
        chatLog: [],
        connected: true,
        pendingPromotion: null,
        whiteRatingChange: null,
        blackRatingChange: null,
        whiteTime: DEFAULT_CLOCK_SECONDS,
        blackTime: DEFAULT_CLOCK_SECONDS,
        gameOver: null,
        rematchState: 'idle',
        rematchFromUser: '',
        confirm: null,
        focus: false,
        clockActive: false,
        spectators: null,
        ...createInitialRequests(),
    };
}

export type GameAction =
    | { type: 'historyRestored'; fenSnapshots: string[]; moveList: string[]; lastMove: MovePair | null }
    | { type: 'positionSet'; fen: string }
    | { type: 'gameLoaded'; game: GameWithPlayers }
    | { type: 'seatResolved'; myColor: SeatColor }
    | { type: 'clockPreset'; seconds: number }
    | {
          type: 'stateSynced';
          history: { fens: string[]; sans: string[] } | null;
          whiteMs: number;
          blackMs: number;
          clockActive: boolean;
          spectators?: number;
      }
    | { type: 'clockActivated' }
    | { type: 'spectatorsChanged'; count: number }
    | { type: 'moveReceived'; fen: string; from: Square; to: Square; san: string; whiteMs?: number; blackMs?: number }
    | { type: 'moveCommitted'; fen: string; from: Square; to: Square }
    | { type: 'takebackApplied'; restored: RestoredPosition }
    | { type: 'moveRejected' }
    | { type: 'squareSelected'; square: Square; dests: Square[] }
    | { type: 'selectionCleared' }
    | { type: 'promotionPending'; move: MovePair }
    | { type: 'historyViewed'; index: number | null }
    | { type: 'clockSynced'; whiteMs: number; blackMs: number }
    | { type: 'clockTicked'; side: string }
    | { type: 'gameEnded'; info: GameOverInfo }
    | { type: 'ratingChanged'; side: PlayerColor; change: number }
    | { type: 'chatReceived'; line: ChatLine }
    | { type: 'chatDraftChanged'; text: string }
    | { type: 'connectionChanged'; connected: boolean }
    | { type: 'rematchReceived'; fromUsername: string }
    | { type: 'rematchExpired' }
    | { type: 'rematchStateSet'; value: RematchState }
    | { type: 'confirmSet'; value: ConfirmDialog }
    | { type: 'focusToggled' }
    | { type: 'flipToggled' }
    | RequestsAction;

type ActionOf<K extends GameAction['type']> = Extract<GameAction, { type: K }>;
type Handlers = { [K in GameAction['type']]: (state: GameState, action: ActionOf<K>) => GameState };

const msToSeconds = (ms: number) => Math.round(ms / MS_PER_SECOND);

/**
 * clock_sync rule (F5): take the server value when the local clock is more than
 * CLOCK_SYNC_TOLERANCE_MS away from it; otherwise (or for NaN) keep the local value, so a
 * sync that agrees within half a second never makes the display jump.
 */
function syncedSeconds(prev: number, ms: number): number {
    return Math.abs(prev * MS_PER_SECOND - ms) > CLOCK_SYNC_TOLERANCE_MS ? msToSeconds(ms) : prev;
}

/** Fresh empty destination list each time, as the legacy `setLegalDests([])` did. */
const noSelection = () => ({ selectedSq: null, legalDests: [] as Square[] });

const handlers: Handlers = {
    historyRestored: (s, a) => ({ ...s, fenSnapshots: a.fenSnapshots, moveList: a.moveList, lastMove: a.lastMove }),
    positionSet: (s, a) => ({ ...s, fen: a.fen }),
    gameLoaded: (s, a) => ({ ...s, gameData: a.game }),
    // Colour decides orientation for players; a spectator keeps the current orientation.
    seatResolved: (s, a) =>
        a.myColor === 'spectator'
            ? { ...s, myColor: a.myColor }
            : { ...s, myColor: a.myColor, flipped: a.myColor === 'black' },
    clockPreset: (s, a) => ({ ...s, whiteTime: a.seconds, blackTime: a.seconds }),
    stateSynced: (s, a) => ({
        ...s,
        ...(a.history ? { fenSnapshots: a.history.fens, moveList: a.history.sans } : {}),
        whiteTime: msToSeconds(a.whiteMs),
        blackTime: msToSeconds(a.blackMs),
        clockActive: a.clockActive,
        ...(a.spectators === undefined ? {} : { spectators: a.spectators }),
    }),
    clockActivated: (s) => ({ ...s, clockActive: true }),
    spectatorsChanged: (s, a) => ({ ...s, spectators: a.count }),
    moveReceived: (s, a) => ({
        ...s,
        ...noSelection(),
        ...clearedRequests(),
        fen: a.fen,
        fenSnapshots: [...s.fenSnapshots, a.fen],
        viewIndex: null,
        lastMove: { from: a.from, to: a.to },
        moveList: [...s.moveList, a.san],
        whiteTime: a.whiteMs !== undefined ? msToSeconds(a.whiteMs) : s.whiteTime,
        blackTime: a.blackMs !== undefined ? msToSeconds(a.blackMs) : s.blackTime,
    }),
    moveCommitted: (s, a) => ({
        ...s,
        ...noSelection(),
        fen: a.fen,
        lastMove: { from: a.from, to: a.to },
        pendingPromotion: null,
    }),
    // The server rolled the game back: its position, history and clocks replace ours.
    takebackApplied: (s, { restored: r }) => ({
        ...s,
        ...noSelection(),
        ...clearedRequests(),
        fen: r.fen,
        fenSnapshots: r.fens,
        moveList: r.sans,
        lastMove: r.lastMove,
        viewIndex: null,
        pendingPromotion: null,
        whiteTime: msToSeconds(r.whiteMs),
        blackTime: msToSeconds(r.blackMs),
        clockActive: r.clockActive,
    }),
    // The server refused the optimistic move; game_state_sync (sent right after) restores the position.
    moveRejected: (s) => ({ ...s, ...noSelection(), lastMove: null, pendingPromotion: null }),
    squareSelected: (s, a) => ({ ...s, selectedSq: a.square, legalDests: a.dests }),
    selectionCleared: (s) => ({ ...s, ...noSelection() }),
    promotionPending: (s, a) => ({ ...s, ...noSelection(), pendingPromotion: a.move }),
    historyViewed: (s, a) => ({ ...s, ...noSelection(), viewIndex: a.index }),
    clockSynced: (s, a) => ({
        ...s,
        whiteTime: syncedSeconds(s.whiteTime, a.whiteMs),
        blackTime: syncedSeconds(s.blackTime, a.blackMs),
    }),
    clockTicked: (s, a) =>
        a.side === 'w'
            ? { ...s, whiteTime: Math.max(0, s.whiteTime - 1) }
            : { ...s, blackTime: Math.max(0, s.blackTime - 1) },
    // A confirmation still open when the game ends no longer applies.
    gameEnded: (s, a) => ({
        ...s,
        ...clearedRequests(),
        confirm: null,
        gameOver: { result: a.info.result, reason: a.info.reason },
    }),
    ratingChanged: (s, a) =>
        a.side === 'white' ? { ...s, whiteRatingChange: a.change } : { ...s, blackRatingChange: a.change },
    chatReceived: (s, a) => ({ ...s, chatLog: [...s.chatLog, a.line] }),
    chatDraftChanged: (s, a) => ({ ...s, chatMsg: a.text }),
    connectionChanged: (s, a) => ({ ...s, connected: a.connected }),
    rematchReceived: (s, a) => ({ ...s, rematchFromUser: a.fromUsername, rematchState: 'received' }),
    rematchExpired: (s) => (s.rematchState === 'received' ? { ...s, rematchState: 'idle' } : s),
    rematchStateSet: (s, a) => ({ ...s, rematchState: a.value }),
    confirmSet: (s, a) => ({ ...s, confirm: a.value }),
    focusToggled: (s) => ({ ...s, focus: !s.focus }),
    flipToggled: (s) => ({ ...s, flipped: !s.flipped }),
    ...requestHandlers,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
    const handle = handlers[action.type] as (s: GameState, a: GameAction) => GameState;
    return handle(state, action);
}
