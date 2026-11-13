'use client';

import { useCallback, useState } from 'react';
import type { Move } from 'chess.js';
import { playGameEndSound } from '@/lib/sounds';
import { playerMoveCount, playSoundForMove, undoToPlayerTurn } from '../game';
import { handleSquareClick } from '../squareClick';
import type { Difficulty, Side } from '../types';
import { useChessPosition } from './useChessPosition';
import { useMaverickMove } from './useMaverickMove';
import { usePieceSelection } from './usePieceSelection';

const REPLY_DELAY_MS = 250;

/** Board state, player input, takeback and resign for one game against MAVERICK. */
export function useComputerBoard(difficulty: Difficulty) {
    const { game, moveHistory, lastMove, setLastMove, refresh } = useChessPosition();
    const [playerColor, setPlayerColor] = useState<Side>('w');
    const [resigned, setResigned] = useState(false);

    const selection = usePieceSelection(game, playerColor);
    const engine = useMaverickMove({ game, difficulty, refresh, setLastMove });
    const { thinking, engineError, clearEngineError, maverickMove } = engine;
    const gameOver = game.isGameOver() || resigned;
    /** Takeback needs a move of the player's to undo (F13). */
    const canTakeBack = playerMoveCount(game, playerColor) > 0 && !thinking;

    const onPlayerMove = (result: Move) => {
        selection.clearSelection();
        setLastMove({ from: result.from, to: result.to });
        playSoundForMove(game, result);
        refresh();
        if (!game.isGameOver()) setTimeout(() => maverickMove(), REPLY_DELAY_MS);
        else playGameEndSound(true);
    };
    const onSquareClick = (square: string) =>
        handleSquareClick({ game, playerColor, blocked: gameOver || thinking, selection, onPlayerMove }, square);

    const undoMove = () => {
        if (!canTakeBack) return;
        // Undo both MAVERICK's reply and your move so it's your turn again.
        const last = undoToPlayerTurn(game, playerColor);
        selection.clearSelection();
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
    const { clearSelection } = selection;
    const resetBoard = useCallback(
        (color: Side) => {
            game.reset();
            setPlayerColor(color);
            clearSelection();
            setLastMove(null);
            setResigned(false);
            clearEngineError();
            refresh();
        },
        [game, clearSelection, setLastMove, clearEngineError, refresh],
    );

    const state = { game, playerColor, moveHistory, lastMove, resigned, thinking, engineError, gameOver, canTakeBack };
    const actions = { maverickMove, handleSquareClick: onSquareClick, undoMove, resign, resetBoard };
    const { selectedSquare, legalMoves } = selection;
    return {
        ...state,
        ...actions,
        canRetryEngine: engine.canRetry,
        retryEngine: engine.retry,
        selectedSquare,
        legalMoves,
    };
}
