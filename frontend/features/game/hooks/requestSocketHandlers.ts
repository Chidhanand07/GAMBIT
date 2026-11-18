// Handlers for the server events about requests between the players: draw offers (ADR F-151)
// and takebacks (ADR F-152). The server is the authority; these only mirror what it broadcast.
import type { Square } from 'chess.js';
import type {
    DrawDeclinedPayload,
    DrawOfferedPayload,
    GameStateSyncPayload,
    TakebackAppliedPayload,
    TakebackDeclinedPayload,
    TakebackPrefsPayload,
    TakebackRequestedPayload,
} from '@/types/socket';
import type { GameAction, MovePair, RestoredPosition } from '../state/gameReducer';
import type { SocketHandlerContext, SocketListener } from './gameSocketHandlers';

/** The standing requests a (re)joining client is told about in `game_state_sync`. */
export function requestsSyncedFrom(data: GameStateSyncPayload): GameAction {
    return {
        type: 'requestsSynced',
        drawOffer: data.drawOffer?.by ?? null,
        lastDrawOfferPly: data.lastDrawOfferPly ?? {},
        takeback: data.takeback ?? null,
        takebackPrefs: data.takebackPrefs ?? {},
    };
}

const UCI_TO_END = 4;

/** The last move of a UCI move log as board squares; null for an empty log. */
function lastMoveOf(log: TakebackAppliedPayload['moveLog']): MovePair | null {
    const uci = log.at(-1)?.move;
    if (!uci) return null;
    return { from: uci.slice(0, 2) as Square, to: uci.slice(2, UCI_TO_END) as Square };
}

function restoredFrom(data: TakebackAppliedPayload): RestoredPosition {
    return {
        fen: data.fen,
        fens: data.moveLog.map((m) => m.fen),
        sans: data.moveLog.map((m) => m.san),
        lastMove: lastMoveOf(data.moveLog),
        whiteMs: data.whiteMs,
        blackMs: data.blackMs,
        clockActive: data.clockActive,
    };
}

const isOtherPlayer = (ctx: SocketHandlerContext, by: string) => ctx.myColor !== 'spectator' && by !== ctx.myColor;

function onDrawOffered(ctx: SocketHandlerContext) {
    return (data: DrawOfferedPayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'drawOffered', by: data.by, ply: data.ply });
    };
}

/** The offer is gone; the player who made it is told it was declined (a toast). */
function onDrawDeclined(ctx: SocketHandlerContext) {
    return (data: DrawDeclinedPayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'drawOfferCleared' });
        if (isOtherPlayer(ctx, data.by)) ctx.inform?.('Draw declined');
    };
}

function onTakebackRequested(ctx: SocketHandlerContext) {
    return (data: TakebackRequestedPayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'takebackRequested', by: data.by, plies: data.plies });
    };
}

function onTakebackDeclined(ctx: SocketHandlerContext) {
    return (data: TakebackDeclinedPayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.dispatch({ type: 'takebackCleared' });
        if (isOtherPlayer(ctx, data.by)) ctx.inform?.('Takeback declined');
    };
}

/** The game was rolled back: the board, history and clocks follow the server. */
function onTakebackApplied(ctx: SocketHandlerContext) {
    return (data: TakebackAppliedPayload) => {
        if (data.game_id !== ctx.gameId) return;
        ctx.chessRef.current.load(data.fen);
        ctx.lastProcessedFenRef.current = data.fen;
        ctx.dispatch({ type: 'takebackApplied', restored: restoredFrom(data) });
        ctx.inform?.(data.plies === 1 ? 'A move was taken back' : 'Two moves were taken back');
    };
}

function onTakebackPrefs(ctx: SocketHandlerContext) {
    return ({ game_id: gameId, white, black }: TakebackPrefsPayload) => {
        if (gameId !== ctx.gameId) return;
        ctx.dispatch({
            type: 'takebackPrefsSet',
            prefs: { ...(white === undefined ? {} : { white }), ...(black === undefined ? {} : { black }) },
        });
    };
}

export function requestHandlerList(ctx: SocketHandlerContext): Array<[string, SocketListener]> {
    return [
        ['draw_offered', onDrawOffered(ctx)],
        ['draw_declined', onDrawDeclined(ctx)],
        ['takeback_requested', onTakebackRequested(ctx)],
        ['takeback_declined', onTakebackDeclined(ctx)],
        ['takeback_applied', onTakebackApplied(ctx)],
        ['takeback_prefs', onTakebackPrefs(ctx)],
    ];
}
