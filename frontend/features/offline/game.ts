// Pure helpers for the MAVERICK computer game (app/offline).
import type { Chess, Move } from 'chess.js';
import { playCaptureSound, playCheckSound, playGameEndSound, playMoveSound } from '@/lib/sounds';
import type { LastMove, Side } from './types';

/** Play a sound appropriate to the move just made. */
export function playSoundForMove(game: Chess, result: Move | null) {
    if (game.isCheckmate()) {
        playGameEndSound(false);
        return;
    }
    if (game.inCheck()) {
        playCheckSound();
        return;
    }
    if (result?.captured) {
        playCaptureSound();
        return;
    }
    playMoveSound();
}

/** Try a player move (always promoting to a queen); null when illegal. */
export function tryMove(game: Chess, from: string, to: string): Move | null {
    try {
        return game.move({ from, to, promotion: 'q' });
    } catch {
        return null;
    }
}

/** Game-over overlay text. */
export function resultText(game: Chess, playerColor: Side, resigned: boolean) {
    if (resigned) return 'You resigned';
    if (game.isCheckmate()) return game.turn() === playerColor ? 'MAVERICK wins by checkmate' : 'You win by checkmate!';
    if (game.isStalemate()) return 'Stalemate';
    return game.isDraw() ? 'Draw' : 'Game over';
}

/** Resolve the colour choice, flipping a coin for 'random'. */
export function resolveColor(choice: Side | 'random'): Side {
    if (choice !== 'random') return choice;
    return Math.random() < 0.5 ? 'w' : 'b';
}

/** How many of the moves played so far are the player's (White moves on even plies). */
export function playerMoveCount(game: Chess, playerColor: Side): number {
    const plies = game.history().length;
    const whiteMoves = Math.ceil(plies / 2);
    return playerColor === 'w' ? whiteMoves : plies - whiteMoves;
}

function lastMoveOf(game: Chess): LastMove | null {
    const hist = game.history({ verbose: true });
    const last = hist[hist.length - 1];
    return last ? { from: last.from, to: last.to } : null;
}

/**
 * Undo MAVERICK's reply (if it came) and the player's last move so it is the player's turn
 * again; returns the new last move. With no move of the player's to take back (as Black,
 * only MAVERICK's opening move) nothing is undone: undoing that move would hand the turn to
 * MAVERICK with nothing asking it to move (F13).
 */
export function undoToPlayerTurn(game: Chess, playerColor: Side): LastMove | null {
    if (playerMoveCount(game, playerColor) === 0) return lastMoveOf(game);
    game.undo();
    if (game.turn() !== playerColor) game.undo();
    return lastMoveOf(game);
}
