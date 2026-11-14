// Render-time values derived from the game state: which player/clock sits on top vs bottom,
// whose clock is running, and the turn label. Pure (reads the live chess turn passed in).
import type { Chess } from 'chess.js';
import type { ProfileSummary } from '@/types/profile';
import type { GameState } from '../state/gameReducer';

export interface StripView {
    player: ProfileSummary | null | undefined;
    time: number;
    isActive: boolean;
    ratingChange: number | null;
    /** True only on the strip of the viewer's own colour; never for a spectator (F4). */
    isMe: boolean;
}

export interface GameView {
    top: StripView;
    bottom: StripView;
    isMyTurn: boolean;
    /** Shown in the modal for players only. */
    myRatingChange: number | null;
    turnIndicator: { isWhiteToMove: boolean; label: string } | null;
}

const nameOr = (p: ProfileSummary | null | undefined, fallback: string) => p?.display_name || p?.username || fallback;

function stripViews(state: GameState, turnColor: string): { top: StripView; bottom: StripView } {
    const { gameData, flipped, gameOver, myColor } = state;
    const topIsActive = !gameOver && ((flipped && turnColor === 'w') || (!flipped && turnColor === 'b'));
    const white = {
        player: gameData?.white,
        time: state.whiteTime,
        ratingChange: state.whiteRatingChange,
        isMe: myColor === 'white',
    };
    const black = {
        player: gameData?.black,
        time: state.blackTime,
        ratingChange: state.blackRatingChange,
        isMe: myColor === 'black',
    };
    const [top, bottom] = flipped ? [white, black] : [black, white];
    return { top: { ...top, isActive: topIsActive }, bottom: { ...bottom, isActive: !gameOver && !topIsActive } };
}

function turnLabel(state: GameState, turnColor: string, isMyTurn: boolean): string {
    if (isMyTurn) return 'Your turn';
    const name = turnColor === 'w' ? nameOr(state.gameData?.white, 'White') : nameOr(state.gameData?.black, 'Black');
    return `${name}'s turn`;
}

export function deriveGameView(state: GameState, liveChess: Pick<Chess, 'turn'>, isMyTurn: boolean): GameView {
    const turnColor = liveChess.turn();
    return {
        ...stripViews(state, turnColor),
        isMyTurn,
        myRatingChange: state.myColor === 'white' ? state.whiteRatingChange : state.blackRatingChange,
        turnIndicator: state.gameOver
            ? null
            : { isWhiteToMove: turnColor === 'w', label: turnLabel(state, turnColor, isMyTurn) },
    };
}
