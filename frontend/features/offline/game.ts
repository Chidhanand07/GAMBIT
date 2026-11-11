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

/** Undo MAVERICK's reply and the player's move so it is the player's turn again; returns the new last move. */
export function undoToPlayerTurn(game: Chess, playerColor: Side): LastMove | null {
    game.undo();
    if (game.turn() !== playerColor) game.undo();
    const hist = game.history({ verbose: true });
    const last = hist[hist.length - 1];
    return last ? { from: last.from, to: last.to } : null;
}
