// Requests between the two players of a live game, as the server reported them: the standing
// draw offer (ADR F-151) and takeback request (ADR F-152), each player's stored takeback setting, and
// this player's own queued premove (ADR F-153).
// The server is the authority; this slice only mirrors its events.
import type { Square } from 'chess.js';
import type { PlayerColor } from '@/types/game';

/** A move queued for the opponent's turn; the server plays it right after their move. */
export interface QueuedPremove {
    from: Square;
    to: Square;
}

export interface RequestsState {
    /** The side whose draw offer stands, if any. */
    drawOffer: PlayerColor | null;
    /** Moves played when each side last offered a draw (the cadence rule, utils/drawOffer). */
    lastDrawOfferPly: Partial<Record<PlayerColor, number>>;
    /** The standing takeback request: who asked, and how many plies it undoes. */
    takeback: { by: PlayerColor; plies: number } | null;
    /**
     * Whether each player lets the opponent ask for takebacks, from their stored preferences as
     * the server read them when this client joined (ADR F-166; absent: not allowed).
     */
    takebackPrefs: Partial<Record<PlayerColor, boolean>>;
    /** This player's queued premove, as the server holds it. */
    premove: QueuedPremove | null;
}

export function createInitialRequests(): RequestsState {
    return { drawOffer: null, lastDrawOfferPly: {}, takeback: null, takebackPrefs: {}, premove: null };
}

export type RequestsAction =
    | { type: 'drawOffered'; by: PlayerColor; ply: number }
    | { type: 'drawOfferCleared' }
    | { type: 'takebackRequested'; by: PlayerColor; plies: number }
    | { type: 'takebackCleared' }
    | { type: 'premoveQueued'; premove: QueuedPremove }
    | { type: 'premoveCleared' }
    | ({ type: 'requestsSynced' } & RequestsState);

type ActionOf<K extends RequestsAction['type']> = Extract<RequestsAction, { type: K }>;
type Handlers = { [K in RequestsAction['type']]: <S extends RequestsState>(state: S, action: ActionOf<K>) => S };

/** What a move does to the standing requests: they lapse (a premove waits for the move, ADR F-153). */
export const clearedRequests = (): Pick<RequestsState, 'drawOffer' | 'takeback'> => ({
    drawOffer: null,
    takeback: null,
});

/** What the end of the game and a takeback do: every request lapses, a queued premove too. */
export const allClearedRequests = (): Pick<RequestsState, 'drawOffer' | 'takeback' | 'premove'> => ({
    ...clearedRequests(),
    premove: null,
});

export const requestHandlers: Handlers = {
    drawOffered: (s, a) => ({
        ...s,
        drawOffer: a.by,
        lastDrawOfferPly: { ...s.lastDrawOfferPly, [a.by]: a.ply },
    }),
    drawOfferCleared: (s) => ({ ...s, drawOffer: null }),
    takebackRequested: (s, a) => ({ ...s, takeback: { by: a.by, plies: a.plies } }),
    takebackCleared: (s) => ({ ...s, takeback: null }),
    premoveQueued: (s, a) => ({ ...s, premove: a.premove }),
    premoveCleared: (s) => ({ ...s, premove: null }),
    requestsSynced: (s, a) => ({
        ...s,
        drawOffer: a.drawOffer,
        lastDrawOfferPly: a.lastDrawOfferPly,
        takeback: a.takeback,
        takebackPrefs: a.takebackPrefs,
        premove: a.premove,
    }),
};
