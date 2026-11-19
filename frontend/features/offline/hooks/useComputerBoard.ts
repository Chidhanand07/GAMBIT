'use client';

import { useCallback, useState } from 'react';
import { playGameEndSound } from '@/lib/sounds';
import { playerMoveCount, undoToPlayerTurn } from '../game';
import type { Difficulty, Side } from '../types';
import { useChessPosition } from './useChessPosition';
import { useMaverickMove } from './useMaverickMove';
import { usePlayerInput } from './usePlayerInput';

/** Board state, player input, takeback and resign for one game against MAVERICK. */
export function useComputerBoard(difficulty: Difficulty) {
    const { game, moveHistory, lastMove, setLastMove, refresh } = useChessPosition();
    const [playerColor, setPlayerColor] = useState<Side>('w');
    const [resigned, setResigned] = useState(false);

    const engine = useMaverickMove({ game, difficulty, refresh, setLastMove });
    const { thinking, engineError, clearEngineError, maverickMove } = engine;
    const gameOver = game.isGameOver() || resigned;
    /** Takeback needs a move of the player's to undo (F13). */
    const canTakeBack = playerMoveCount(game, playerColor) > 0 && !thinking;

    const input = usePlayerInput({
        game,
        playerColor,
        blocked: gameOver || thinking,
        setLastMove,
        refresh,
        maverickMove,
    });

    const undoMove = () => {
        if (!canTakeBack) return;
        // Undo both MAVERICK's reply and your move so it's your turn again.
        const last = undoToPlayerTurn(game, playerColor);
        input.clearInput();
        clearEngineError();
        setResigned(false);
        setLastMove(last);
        refresh();
    };

    const resign = () => {
        if (!gameOver) {
            setResigned(true);
            playGameEndSound(false);
        }
    };

    /** Reset to the start position with the player on `color`. */
    const { clearInput } = input;
    const resetBoard = useCallback(
        (color: Side) => {
            game.reset();
            setPlayerColor(color);
            clearInput();
            setLastMove(null);
            setResigned(false);
            clearEngineError();
            refresh();
        },
        [game, clearInput, setLastMove, clearEngineError, refresh],
    );

    const state = { game, playerColor, moveHistory, lastMove, resigned, thinking, engineError, gameOver, canTakeBack };
    const actions = { maverickMove, handleSquareClick: input.onSquareClick, undoMove, resign, resetBoard };
    return {
        ...state,
        ...actions,
        canRetryEngine: engine.canRetry,
        retryEngine: engine.retry,
        selectedSquare: input.selectedSquare,
        legalMoves: input.legalMoves,
        pendingPromotion: input.pendingPromotion,
        promote: input.promote,
    };
}
