// Move-history navigation and localStorage persistence (key `gambit-game-<id>`).
import type { MovePair } from '../state/gameReducer';

export interface StoredHistory {
    fenSnapshots?: string[];
    moveList?: string[];
    lastMove?: MovePair | null;
}

export const historyStorageKey = (gameId: string) => `gambit-game-${gameId}`;

/** One step back from the viewed index (or from the live end); clamps at 0. */
export function stepBackIndex(viewIndex: number | null, length: number): number {
    return Math.max(0, (viewIndex ?? length) - 1);
}

/** One step forward; past the last snapshot returns null (live). */
export function stepForwardIndex(viewIndex: number | null, length: number): number | null {
    const next = (viewIndex ?? -1) + 1;
    return next >= length ? null : next;
}

export function saveHistory(key: string, history: Required<StoredHistory>): void {
    try {
        localStorage.setItem(
            key,
            JSON.stringify({
                fenSnapshots: history.fenSnapshots,
                moveList: history.moveList,
                lastMove: history.lastMove,
            }),
        );
    } catch {
        /* storage full or unavailable */
    }
}
