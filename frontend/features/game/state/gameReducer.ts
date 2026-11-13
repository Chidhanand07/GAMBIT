// Typed reducer for the live game page (replaces the page's individual useState calls).
// Every action mirrors one group of setState calls in the legacy page; fields an action
// does not mention keep their identity so effects keyed on them re-run at the same moments.
import { Chess, type Square } from 'chess.js';
import type { GameWithPlayers, PlayerColor, SeatColor } from '@/types/game';

export interface MovePair {
    from: Square;
    to: Square;
}

export interface GameOverInfo {
    result: string;
    reason: string;
}

export interface ChatLine {
    from: string;
    text: string;
}

export type SidebarTab = 'Moves' | 'Engine' | 'Chat';
export type RematchState = 'idle' | 'sent' | 'received' | 'declined';

export interface GameState {
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
    soundOn: boolean;
    activeTab: SidebarTab;
    chatMsg: string;
    chatLog: ChatLine[];
    connected: boolean;
    pendingPromotion: MovePair | null;
    whiteRatingChange: number | null;
    blackRatingChange: number | null;
    showGameOverModal: boolean;
    /** Seconds. */
    whiteTime: number;
    blackTime: number;
    gameOver: GameOverInfo | null;
    rematchState: RematchState;
    rematchFromUser: string;
    resignConfirm: boolean;
    /** Set by the server after the first move; the display clock only ticks while true. */
    clockActive: boolean;
}

const DEFAULT_CLOCK_SECONDS = 600;
const MS_PER_SECOND = 1000;
/** clock_sync overrides the local clock only when it has drifted further than this from the server. */
export const CLOCK_SYNC_TOLERANCE_MS = 500;
const WELCOME_LINE: ChatLine = { from: 'System', text: 'Game started. Good luck!' };

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
        soundOn: true,
        activeTab: 'Moves',
        chatMsg: '',
        chatLog: [WELCOME_LINE],
        connected: true,
        pendingPromotion: null,
        whiteRatingChange: null,
        blackRatingChange: null,
        showGameOverModal: false,
        whiteTime: DEFAULT_CLOCK_SECONDS,
        blackTime: DEFAULT_CLOCK_SECONDS,
        gameOver: null,
        rematchState: 'idle',
        rematchFromUser: '',
        resignConfirm: false,
        clockActive: false,
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
      }
    | { type: 'clockActivated' }
    | { type: 'moveReceived'; fen: string; from: Square; to: Square; san: string; whiteMs?: number; blackMs?: number }
    | { type: 'moveCommitted'; fen: string; from: Square; to: Square }
    | { type: 'moveRejected' }
    | { type: 'squareSelected'; square: Square; dests: Square[] }
    | { type: 'selectionCleared' }
    | { type: 'promotionPending'; move: MovePair }
    | { type: 'historyViewed'; index: number | null }
    | { type: 'clockSynced'; whiteMs: number; blackMs: number }
    | { type: 'clockTicked'; side: string }
    | { type: 'gameEnded'; info: GameOverInfo }
    | { type: 'gameOverModalShown'; visible: boolean }
    | { type: 'ratingChanged'; side: PlayerColor; change: number }
    | { type: 'chatReceived'; line: ChatLine }
    | { type: 'chatDraftChanged'; text: string }
    | { type: 'connectionChanged'; connected: boolean }
    | { type: 'rematchReceived'; fromUsername: string }
    | { type: 'rematchExpired' }
    | { type: 'rematchStateSet'; value: RematchState }
    | { type: 'resignConfirmSet'; value: boolean }
    | { type: 'tabSelected'; tab: SidebarTab }
    | { type: 'soundToggled' }
    | { type: 'flipToggled' };

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
    }),
    clockActivated: (s) => ({ ...s, clockActive: true }),
    moveReceived: (s, a) => ({
        ...s,
        ...noSelection(),
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
    gameEnded: (s, a) => ({ ...s, gameOver: { result: a.info.result, reason: a.info.reason } }),
    gameOverModalShown: (s, a) => ({ ...s, showGameOverModal: a.visible }),
    ratingChanged: (s, a) =>
        a.side === 'white' ? { ...s, whiteRatingChange: a.change } : { ...s, blackRatingChange: a.change },
    chatReceived: (s, a) => ({ ...s, chatLog: [...s.chatLog, a.line] }),
    chatDraftChanged: (s, a) => ({ ...s, chatMsg: a.text }),
    connectionChanged: (s, a) => ({ ...s, connected: a.connected }),
    rematchReceived: (s, a) => ({ ...s, rematchFromUser: a.fromUsername, rematchState: 'received' }),
    rematchExpired: (s) => (s.rematchState === 'received' ? { ...s, rematchState: 'idle' } : s),
    rematchStateSet: (s, a) => ({ ...s, rematchState: a.value }),
    resignConfirmSet: (s, a) => ({ ...s, resignConfirm: a.value }),
    tabSelected: (s, a) => ({ ...s, activeTab: a.tab }),
    soundToggled: (s) => ({ ...s, soundOn: !s.soundOn }),
    flipToggled: (s) => ({ ...s, flipped: !s.flipped }),
};

export function gameReducer(state: GameState, action: GameAction): GameState {
    const handle = handlers[action.type] as (s: GameState, a: GameAction) => GameState;
    return handle(state, action);
}
