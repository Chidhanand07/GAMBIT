'use client';

// Move history: restore from / persist to localStorage, and ←/→ keyboard navigation.
import { useEffect, useRef, type Dispatch, type MutableRefObject } from 'react';
import type { Chess } from 'chess.js';
import type { GameAction, GameState } from '../state/gameReducer';
import { historyStorageKey, saveHistory, stepBackIndex, stepForwardIndex, type StoredHistory } from '../utils/history';

interface Options {
    gameId: string;
    state: Pick<GameState, 'fenSnapshots' | 'moveList' | 'lastMove' | 'viewIndex'>;
    chessRef: MutableRefObject<Chess>;
    dispatch: Dispatch<GameAction>;
}

const isTypingTarget = (target: EventTarget | null) => {
    const tag = (target as HTMLElement)?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
};

export function useMoveHistory({ gameId, state, chessRef, dispatch }: Options): void {
    const { fenSnapshots, moveList, lastMove, viewIndex } = state;
    const lsKey = historyStorageKey(gameId);

    // Synced every render so the mount-only keydown listener reads current values.
    const viewIndexRef = useRef<number | null>(null);
    const fenSnapshotsLenRef = useRef<number>(0);
    viewIndexRef.current = viewIndex;
    fenSnapshotsLenRef.current = fenSnapshots.length;

    // Restore once per game (before socket events arrive); chessRef and dispatch are stable.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(lsKey);
            if (!raw) return;
            const saved: StoredHistory = JSON.parse(raw);
            if ((saved.fenSnapshots?.length ?? 0) > 0) {
                const snaps = saved.fenSnapshots as string[];
                dispatch({
                    type: 'historyRestored',
                    fenSnapshots: snaps,
                    moveList: saved.moveList ?? [],
                    lastMove: saved.lastMove ?? null,
                });
                const latestFen = snaps[snaps.length - 1];
                chessRef.current.load(latestFen);
                dispatch({ type: 'positionSet', fen: latestFen });
            }
        } catch {
            /* corrupt data, ignore */
        }
    }, [lsKey, chessRef, dispatch]);

    useEffect(() => {
        if (fenSnapshots.length > 0) saveHistory(lsKey, { fenSnapshots, moveList, lastMove });
    }, [fenSnapshots, moveList, lastMove, lsKey]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            const vi = viewIndexRef.current;
            const len = fenSnapshotsLenRef.current;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (len === 0) return;
                dispatch({ type: 'historyViewed', index: stepBackIndex(vi, len) });
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (len === 0) return;
                dispatch({ type: 'historyViewed', index: stepForwardIndex(vi, len) });
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [dispatch]);
}
