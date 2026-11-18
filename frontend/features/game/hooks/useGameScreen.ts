'use client';

// Everything the live game screen renders: the controller (state, board, commands) plus the
// derived view (player bars, status, title, info rows) and the board's marks.
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';
import { checkedKingSquare } from '@/lib/chess/board';
import { deriveGameView } from '../utils/gameView';
import { useGameController } from './useGameController';

export function useGameScreen(gameId: string) {
    const game = useGameController(gameId);
    const { profile } = useProfile();
    const { onlineUserIds } = usePresence();
    const { state, board, disconnect, liveChess } = game;
    const displayFen = board.displayChess.fen();
    const isMyTurn = board.isMyTurn();
    const view = deriveGameView({
        state,
        liveChess,
        displayFen,
        isMyTurn,
        onlineUserIds,
        opponentDisconnected: disconnect.opponentDisconnected,
    });
    return {
        ...game,
        view,
        me: profile ? { id: profile.id, username: profile.username } : null,
        displayFen,
        /** Only the live position shows check (as before). */
        checkSquare: board.isLive ? checkedKingSquare(liveChess) : null,
        /** Focus mode ends with the game (Game.dc.html `focus && !over`). */
        focus: state.focus && !state.gameOver,
    };
}

export type GameScreen = ReturnType<typeof useGameScreen>;
