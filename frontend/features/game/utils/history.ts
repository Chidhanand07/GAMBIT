// Move-history navigation and localStorage persistence (key `gambit-game-<id>`).
import type { MovePair } from '../state/gameReducer';

export interface StoredHistory {
    fenSnapshots?: string[];
    moveList?: string[];
    lastMove?: MovePair | null;
}

export const historyStorageKey = (gameId: string) => `gambit-game-${gameId}`;

// Snapshots hold post-move FENs, so the last one is the live board (F6): stepping back from live
// starts at the one before it, and stepping forward onto the last one returns to live.

/** One step back from the viewed index (from live: the position before the last move); clamps at 0. */
export function stepBackIndex(viewIndex: number | null, length: number): number {
    const liveIndex = length - 1;
    return Math.max(0, (viewIndex ?? liveIndex) - 1);
}

/** One step forward; reaching the last snapshot (or already being live) returns null (live). */
export function stepForwardIndex(viewIndex: number | null, length: number): number | null {
    if (viewIndex === null) return null;
    const next = viewIndex + 1;
    return next >= length - 1 ? null : next;
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
