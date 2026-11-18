// Requests between the two players of a live game, as the server reported them: the standing
// draw offer (ADR F-151). The server is the authority; this slice only mirrors its events.
import type { PlayerColor } from '@/types/game';

export interface RequestsState {
    /** The side whose draw offer stands, if any. */
    drawOffer: PlayerColor | null;
    /** Moves played when each side last offered a draw (the cadence rule, utils/drawOffer). */
    lastDrawOfferPly: Partial<Record<PlayerColor, number>>;
}

export function createInitialRequests(): RequestsState {
    return { drawOffer: null, lastDrawOfferPly: {} };
}

export type RequestsAction =
    | { type: 'drawOffered'; by: PlayerColor; ply: number }
    | { type: 'drawOfferCleared' }
    | {
          type: 'requestsSynced';
          drawOffer: PlayerColor | null;
          lastDrawOfferPly: Partial<Record<PlayerColor, number>>;
      };

type ActionOf<K extends RequestsAction['type']> = Extract<RequestsAction, { type: K }>;
type Handlers = { [K in RequestsAction['type']]: <S extends RequestsState>(state: S, action: ActionOf<K>) => S };

/** What a move or the end of the game does to the standing requests: they lapse. */
export const clearedRequests = (): Pick<RequestsState, 'drawOffer'> => ({ drawOffer: null });

export const requestHandlers: Handlers = {
    drawOffered: (s, a) => ({
        ...s,
        drawOffer: a.by,
        lastDrawOfferPly: { ...s.lastDrawOfferPly, [a.by]: a.ply },
    }),
    drawOfferCleared: (s) => ({ ...s, drawOffer: null }),
    requestsSynced: (s, a) => ({ ...s, drawOffer: a.drawOffer, lastDrawOfferPly: a.lastDrawOfferPly }),
};
