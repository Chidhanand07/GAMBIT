'use client';

// Small UI effect of the game page: keep the latest move in view while the board is live.
import { useEffect, type RefObject } from 'react';

export function useMoveListAutoScroll(
    listRef: RefObject<HTMLDivElement | null>,
    moveList: string[],
    isLive: boolean,
): void {
    useEffect(() => {
        if (listRef.current && isLive) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [moveList, isLive, listRef]);
}
