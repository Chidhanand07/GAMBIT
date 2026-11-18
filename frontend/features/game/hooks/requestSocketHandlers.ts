// Handlers for the server events about requests between the players: draw offers (ADR F-151).
// The server is the authority; these only mirror what it broadcast to the game room.
import type { DrawDeclinedPayload, DrawOfferedPayload, GameStateSyncPayload } from '@/types/socket';
import type { GameAction } from '../state/gameReducer';
import type { SocketHandlerContext, SocketListener } from './gameSocketHandlers';

/** The standing requests a (re)joining client is told about in `game_state_sync`. */
export function requestsSyncedFrom(data: GameStateSyncPayload): GameAction {
    return {
        type: 'requestsSynced',
        drawOffer: data.drawOffer?.by ?? null,
        lastDrawOfferPly: data.lastDrawOfferPly ?? {},
    };
}

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
        if (data.by !== ctx.myColor && ctx.myColor !== 'spectator') ctx.inform?.('Draw declined');
    };
}

export function requestHandlerList(ctx: SocketHandlerContext): Array<[string, SocketListener]> {
    return [
        ['draw_offered', onDrawOffered(ctx)],
        ['draw_declined', onDrawDeclined(ctx)],
    ];
}
