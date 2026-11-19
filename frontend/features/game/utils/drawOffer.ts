// The server's draw-offer cadence (server/src/domain/drawOffer.js, ADR F-151), mirrored so the
// Draw button can be disabled when the server would refuse. The server still decides.
import type { PlayerColor } from '@/types/game';

/** No offer before each side has made a move. */
const PLIES_BEFORE_FIRST_OFFER = 2;
/** A side may offer again only after this many moves of its own since its last offer. */
const OWN_MOVES_BETWEEN_OFFERS = 2;

/** How many moves `color` made in plies [fromPly, toPly). White plays the even plies. */
function ownMovesBetween(color: PlayerColor, fromPly: number, toPly: number): number {
    const parity = color === 'white' ? 0 : 1;
    let count = 0;
    for (let ply = fromPly; ply < toPly; ply++) if (ply % 2 === parity) count++;
    return count;
}

export interface DrawOfferInput {
    color: PlayerColor;
    /** Moves played so far. */
    plies: number;
    /** A draw offer (by either side) is standing. */
    pending: boolean;
    /** Moves played when `color` last offered; undefined if it never did. */
    lastOfferPly: number | undefined;
}

export function canOfferDraw({ color, plies, pending, lastOfferPly }: DrawOfferInput): boolean {
    if (pending || plies < PLIES_BEFORE_FIRST_OFFER) return false;
    return lastOfferPly === undefined || ownMovesBetween(color, lastOfferPly, plies) >= OWN_MOVES_BETWEEN_OFFERS;
}
