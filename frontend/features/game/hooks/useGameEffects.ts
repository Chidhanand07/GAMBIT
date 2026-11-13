'use client';

// Small UI effects of the game page: move-list auto-scroll and the delayed game-over modal.
import { useEffect, type Dispatch, type RefObject } from 'react';
import type { GameAction, GameOverInfo } from '../state/gameReducer';

/** Lets the board render the final position before the modal covers it. */
const GAME_OVER_MODAL_DELAY_MS = 400;

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

export function useGameOverModalDelay(gameOver: GameOverInfo | null, dispatch: Dispatch<GameAction>): void {
    useEffect(() => {
        if (gameOver) {
            const t = setTimeout(
                () => dispatch({ type: 'gameOverModalShown', visible: true }),
                GAME_OVER_MODAL_DELAY_MS,
            );
            return () => clearTimeout(t);
        }
    }, [gameOver, dispatch]);
}
