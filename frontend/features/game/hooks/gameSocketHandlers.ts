// Handlers for the server events the game page listens to: the 13 legacy ones in their original
// registration order, then `move_rejected` (the server refused our move; a resync follows).
// Built once per join (useGameSocket); render-dependent fields are read from `ctx` when an event arrives.
import type { Dispatch, MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type { Chess, Square } from 'chess.js';
import { playGameEndSound } from '@/lib/sounds';
import type { SeatColor } from '@/types/game';
import type {
    ChatMessagePayload,
    ClockSyncPayload,
    GameEndBroadcast,
    GameIdPayload,
    GameStateSyncPayload,
    MoveMadePayload,
    MoveRejectedPayload,
    RatingUpdatedPayload,
    RematchRequestPayload,
} from '@/types/socket';
import type { GameAction } from '../state/gameReducer';
import { playMoveSoundFor } from '../utils/moveEffects';

/** Clocks and flags are optional here so older payloads (and tests) without them still type-check. */
type MoveMadeEvent = Omit<MoveMadePayload, 'whiteMs' | 'blackMs' | 'flags' | 'captured' | 'move'> & {
    move?: string;
    captured?: boolean;
    flags?: string;
    whiteMs?: number;
    blackMs?: number;
};

export type SocketListener = Parameters<Socket['on']>[1];

const REMATCH_TOAST_MS = 30_000;
const DEFAULT_DISCONNECT_TIMEOUT_SECONDS = 20;

export interface SocketHandlerContext {
    socket: Socket;
    gameId: string;
    myColor: SeatColor;
    soundOn: boolean;
    router: { push: (href: string) => void };
    dispatch: Dispatch<GameAction>;
    chessRef: MutableRefObject<Chess>;
    clockSyncedRef: MutableRefObject<boolean>;
    lastProcessedFenRef: MutableRefObject<string | null>;
    markDisconnected: (timeoutSeconds: number) => void;
    markReconnected: () => void;
}

/**
 * Re-emitted on every (re)connect; the server treats re-joins as idempotent. The server
 * already knows who we are from the handshake token, so nothing identifies the user here.
 */
export function joinGameRoom(socket: Socket, gameId: string): void {
    socket.emit('join_game', gameId);
}

function onGameStateSync(ctx: SocketHandlerContext) {
    return (data: GameStateSyncPayload) => {
        ctx.chessRef.current.load(data.fen);
        ctx.dispatch({ type: 'positionSet', fen: data.fen });
        ctx.lastProcessedFenRef.current = data.fen;
        const history =
            data.moveLog?.length > 0
                ? {
                      fens: data.moveLog.map((m) => m.fen).filter(Boolean),
                      sans: data.moveLog.map((m) => m.san).filter(Boolean),
                  }
                : null;
        ctx.dispatch({
            type: 'stateSynced',
            history,
            whiteMs: data.whiteMs,
            blackMs: data.blackMs,
            clockActive: data.clockActive,
        });
        ctx.clockSyncedRef.current = true;
    };
}

function onMoveMade(ctx: SocketHandlerContext) {
    return (data: MoveMadeEvent) => {
        if (data.game_id !== ctx.gameId) return;
        // Deduplicate: same FEN means this event was already processed (duplicate listener).
        if (data.fen === ctx.lastProcessedFenRef.current) return;
        ctx.lastProcessedFenRef.current = data.fen;
        ctx.dispatch({ type: 'clockActivated' });
        ctx.chessRef.current.load(data.fen);
        ctx.dispatch({
            type: 'moveReceived',
            fen: data.fen,
            from: data.from as Square,
            to: data.to as Square,
            san: data.san,
            whiteMs: data.whiteMs,
            blackMs: data.blackMs,
        });
        if (ctx.soundOn) playMoveSoundFor(ctx.chessRef.current, data.flags, data.captured);
        // A move that ends the game is followed by the server's `game_end`; nothing is inferred here.
    };
}

function onChatMessage(ctx: SocketHandlerContext) {
    return (data: ChatMessagePayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'chatReceived', line: { from: data.from, text: data.text } });
    };
}

/** The only place a result is shown from: the server decides every ending. */
function onGameEnd(ctx: SocketHandlerContext) {
    return (data: GameEndBroadcast) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'gameEnded', info: { result: data.result, reason: data.reason } });
        if (ctx.soundOn) playGameEndSound(data.result.toLowerCase().startsWith(ctx.myColor));
    };
}

/** The pending auto-dismiss of the incoming rematch toast; one at a time (F3). */
interface RematchExpiry {
    restart: () => void;
    cancel: () => void;
}

function rematchExpiry(ctx: SocketHandlerContext): RematchExpiry {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => clearTimeout(timer);
    return {
        cancel,
        restart: () => {
            cancel();
            timer = setTimeout(() => ctx.dispatch({ type: 'rematchExpired' }), REMATCH_TOAST_MS);
        },
    };
}

function onRematchRequest(ctx: SocketHandlerContext, expiry: RematchExpiry) {
    return (data: RematchRequestPayload) => {
        ctx.dispatch({ type: 'rematchReceived', fromUsername: data.from_username as string });
        // Auto-dismiss 30 s after the LATEST request if not acted on.
        expiry.restart();
    };
}

/** The server refused our move. Drop the optimistic markers; its game_state_sync restores the board. */
function onMoveRejected(ctx: SocketHandlerContext) {
    return (data: MoveRejectedPayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'moveRejected' });
    };
}

function onClockSync(ctx: SocketHandlerContext) {
    return (data: ClockSyncPayload) => {
        ctx.clockSyncedRef.current = true;
        // Compensate for network lag on the side to move so the display doesn't jump.
        const lag = data.serverTs ? Math.max(0, Date.now() - data.serverTs) : 0;
        const turn = ctx.chessRef.current?.turn() ?? 'w';
        const whiteMs = Math.max(0, data.whiteMs - (turn === 'w' ? lag : 0));
        const blackMs = Math.max(0, data.blackMs - (turn === 'b' ? lag : 0));
        ctx.dispatch({ type: 'clockSynced', whiteMs, blackMs });
    };
}

export interface GameSocketSubscription {
    /** [event, handler] pairs in the legacy `socket.on` order. */
    handlers: Array<[string, SocketListener]>;
    /** Clears the timers the handlers started; call it when the handlers are removed. */
    dispose: () => void;
}

export function createGameSocketHandlers(ctx: SocketHandlerContext): GameSocketSubscription {
    const expiry = rematchExpiry(ctx);
    return { handlers: handlerList(ctx, expiry), dispose: expiry.cancel };
}

function handlerList(ctx: SocketHandlerContext, expiry: RematchExpiry): Array<[string, SocketListener]> {
    const dispatch = (action: GameAction) => ctx.dispatch(action);
    return [
        ['disconnect', () => dispatch({ type: 'connectionChanged', connected: false })],
        [
            'connect',
            () => {
                // Fires on initial connect AND on every reconnect.
                dispatch({ type: 'connectionChanged', connected: true });
                joinGameRoom(ctx.socket, ctx.gameId);
            },
        ],
        ['game_state_sync', onGameStateSync(ctx)],
        ['move_made', onMoveMade(ctx)],
        ['chat_message', onChatMessage(ctx)],
        ['game_end', onGameEnd(ctx)],
        [
            'rating_updated',
            (data: RatingUpdatedPayload) => {
                dispatch({ type: 'ratingChanged', side: 'white', change: data.white.change });
                dispatch({ type: 'ratingChanged', side: 'black', change: data.black.change });
            },
        ],
        ['rematch_request', onRematchRequest(ctx, expiry)],
        ['rematch_ready', (data: GameIdPayload) => ctx.router.push(`/game/${data.game_id}`)],
        ['rematch_declined', () => dispatch({ type: 'rematchStateSet', value: 'declined' })],
        [
            'opponent_disconnected',
            (data: { timeoutSeconds?: number }) =>
                ctx.markDisconnected(data.timeoutSeconds ?? DEFAULT_DISCONNECT_TIMEOUT_SECONDS),
        ],
        ['opponent_reconnected', () => ctx.markReconnected()],
        ['clock_sync', onClockSync(ctx)],
        ['move_rejected', onMoveRejected(ctx)],
    ];
}
