'use client';

import { useCallback } from 'react';
import type { Chess, Move } from 'chess.js';
import { playGameEndSound } from '@/lib/sounds';
import { useUserSettings } from '@/features/settings/SettingsProvider';
import { playSoundForMove, tryMove } from '../game';
import { handleSquareClick } from '../squareClick';
import type { LastMove, Side } from '../types';
import { usePieceSelection } from './usePieceSelection';
import { usePromotionChoice } from './usePromotionChoice';

const REPLY_DELAY_MS = 250;

interface PlayerInputOptions {
    game: Chess;
    playerColor: Side;
    /** Input is ignored while the game is over or MAVERICK is thinking. */
    blocked: boolean;
    setLastMove: (move: LastMove | null) => void;
    refresh: () => void;
    maverickMove: () => void;
}

/**
 * The player's side of the MAVERICK board: piece selection, square clicks and, with auto-queen
 * off (the setting), the promotion choice. After each move MAVERICK replies, or the game ends.
 */
export function usePlayerInput(opts: PlayerInputOptions) {
    const { game, playerColor, blocked, setLastMove, refresh, maverickMove } = opts;
    const selection = usePieceSelection(game, playerColor);

    const onPlayerMove = (result: Move) => {
        selection.clearSelection();
        setLastMove({ from: result.from, to: result.to });
        playSoundForMove(game, result);
        refresh();
        if (!game.isGameOver()) setTimeout(() => maverickMove(), REPLY_DELAY_MS);
        else playGameEndSound(true);
    };
    const promotion = usePromotionChoice(useUserSettings().settings.autoQueen, (move, piece) => {
        const result = blocked ? null : tryMove(game, move.from, move.to, piece);
        if (result) onPlayerMove(result);
    });
    const { onPromotion } = promotion;
    const onSquareClick = (square: string) =>
        handleSquareClick({ game, playerColor, blocked, selection, onPlayerMove, onPromotion }, square);

    const { clearSelection } = selection;
    const clearPromotion = promotion.clear;
    /** Drops the selection and any pending promotion (takeback, new game). */
    const clearInput = useCallback(() => {
        clearSelection();
        clearPromotion();
    }, [clearSelection, clearPromotion]);

    return {
        selectedSquare: selection.selectedSquare,
        legalMoves: selection.legalMoves,
        pendingPromotion: promotion.pending,
        promote: promotion.promote,
        onSquareClick,
        clearInput,
    };
}
