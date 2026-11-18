// When a player can ask for a takeback, mirrored from server/src/domain/takeback.js (ADR F-152)
// so the Takeback button is shown and enabled only when the server would accept the request.
// The cooldown is not mirrored: the server's refusal says so. The server still decides.

export interface TakebackInput {
    /** Moves played so far. */
    plies: number;
    /** It is this player's turn (the opponent has replied to their last move). */
    myTurn: boolean;
    /** A takeback request (by either side) stands. */
    pending: boolean;
}

/** Plies a request undoes now: two once the opponent has replied, else one. */
export const pliesToUndo = (myTurn: boolean): number => (myTurn ? 2 : 1);

export function canRequestTakeback({ plies, myTurn, pending }: TakebackInput): boolean {
    return !pending && pliesToUndo(myTurn) <= plies;
}
