// Requests between the two players of a live game, as the server reported them: the standing
// draw offer (ADR F-151) and takeback request (ADR F-152), and each player's takeback setting.
// The server is the authority; this slice only mirrors its events.
import type { PlayerColor } from '@/types/game';

export interface RequestsState {
    /** The side whose draw offer stands, if any. */
    drawOffer: PlayerColor | null;
    /** Moves played when each side last offered a draw (the cadence rule, utils/drawOffer). */
    lastDrawOfferPly: Partial<Record<PlayerColor, number>>;
    /** The standing takeback request: who asked, and how many plies it undoes. */
    takeback: { by: PlayerColor; plies: number } | null;
    /** Whether each player lets the opponent ask for takebacks (absent: not allowed). */
    takebackPrefs: Partial<Record<PlayerColor, boolean>>;
}

export function createInitialRequests(): RequestsState {
    return { drawOffer: null, lastDrawOfferPly: {}, takeback: null, takebackPrefs: {} };
}

export type RequestsAction =
    | { type: 'drawOffered'; by: PlayerColor; ply: number }
    | { type: 'drawOfferCleared' }
    | { type: 'takebackRequested'; by: PlayerColor; plies: number }
    | { type: 'takebackCleared' }
    | { type: 'takebackPrefsSet'; prefs: Partial<Record<PlayerColor, boolean>> }
    | ({ type: 'requestsSynced' } & RequestsState);

type ActionOf<K extends RequestsAction['type']> = Extract<RequestsAction, { type: K }>;
type Handlers = { [K in RequestsAction['type']]: <S extends RequestsState>(state: S, action: ActionOf<K>) => S };

/** What a move or the end of the game does to the standing requests: they lapse. */
export const clearedRequests = (): Pick<RequestsState, 'drawOffer' | 'takeback'> => ({
    drawOffer: null,
    takeback: null,
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
    takebackPrefsSet: (s, a) => ({ ...s, takebackPrefs: a.prefs }),
    requestsSynced: (s, a) => ({
        ...s,
        drawOffer: a.drawOffer,
        lastDrawOfferPly: a.lastDrawOfferPly,
        takeback: a.takeback,
        takebackPrefs: a.takebackPrefs,
    }),
};
