'use client';

import { useCallback, useState } from 'react';

export interface PendingPromotion {
    from: string;
    to: string;
}

/**
 * The promotion the player is choosing a piece for. With auto-queen on (the setting) there is
 * nothing to choose: `onPromotion` is undefined and a promoting pawn becomes a queen. `promote`
 * hands the pending move and the chosen piece ('q', 'r', 'b' or 'n') to `play`.
 */
export function usePromotionChoice(autoQueen: boolean, play: (move: PendingPromotion, piece: string) => void) {
    const [pending, setPending] = useState<PendingPromotion | null>(null);
    const ask = useCallback((from: string, to: string) => setPending({ from, to }), []);
    const clear = useCallback(() => setPending(null), []);
    const promote = (piece: string) => {
        clear();
        if (pending) play(pending, piece);
    };
    return { pending, onPromotion: autoQueen ? undefined : ask, promote, clear };
}
