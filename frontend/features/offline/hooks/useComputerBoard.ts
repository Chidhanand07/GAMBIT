'use client';

import { useCallback, useState } from 'react';
import type { Move } from 'chess.js';
import { playGameEndSound } from '@/lib/sounds';
import { playSoundForMove, undoToPlayerTurn } from '../game';
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
    const { thinking, engineError, setEngineError, maverickMove } = useMaverickMove({
        game,
        difficulty,
        refresh,
        setLastMove,
    });
    const gameOver = game.isGameOver() || resigned;

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
        if (thinking) return;
        // Undo both MAVERICK's reply and your move so it's your turn again.
        const last = undoToPlayerTurn(game, playerColor);
        selection.clearSelection();
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
            setEngineError(null);
            refresh();
        },
        [game, clearSelection, setLastMove, setEngineError, refresh],
    );

    const state = { game, playerColor, moveHistory, lastMove, resigned, thinking, engineError, gameOver };
    const actions = { maverickMove, handleSquareClick: onSquareClick, undoMove, resign, resetBoard };
    return { ...state, selectedSquare: selection.selectedSquare, legalMoves: selection.legalMoves, ...actions };
}
