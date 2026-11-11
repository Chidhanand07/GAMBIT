// Player commands that emit to the realtime server: chat, resign, rematch request/accept/decline.
// Payloads are byte-for-byte the legacy ones, including the decline addressee bug (see the PR notes).
import type { Dispatch } from 'react';
import type { Socket } from 'socket.io-client';
import { playGameEndSound } from '@/lib/sounds';
import type { Profile } from '@/types/profile';
import { gameEndPayload, rematchTerms } from './payloads';
import type { GameAction, GameState } from './state/gameReducer';

export interface CommandContext {
    socket: Socket | null;
    myProfile: Profile | null;
    gameId: string;
    state: GameState;
    dispatch: Dispatch<GameAction>;
}

export function sendChat({ socket, myProfile, gameId, state, dispatch }: CommandContext): void {
    if (!state.chatMsg.trim() || !myProfile || !socket) return;
    socket.emit('send_message', { game_id: gameId, from: myProfile.username, text: state.chatMsg.trim() });
    // Not added locally: the server broadcasts back to the whole room including the sender.
    dispatch({ type: 'chatDraftChanged', text: '' });
}

export function resign({ socket, myProfile, gameId, state, dispatch }: CommandContext): void {
    if (!socket || !myProfile || state.gameOver) return;
    const info = { result: state.myColor === 'white' ? 'Black wins' : 'White wins', reason: 'Resignation' };
    dispatch({ type: 'gameEnded', info });
    dispatch({ type: 'resignConfirmSet', value: false });
    socket.emit('game_end', gameEndPayload(gameId, info, state.gameData));
    if (state.soundOn) playGameEndSound(false);
}

const opponentIdOf = ({ myColor, gameData }: GameState) =>
    myColor === 'white' ? gameData?.black_id : gameData?.white_id;

const myDisplayName = (p: Profile | null) => p?.display_name || p?.username;

export function requestRematch({ socket, myProfile, state, dispatch }: CommandContext): void {
    socket?.emit('rematch_request', {
        from_user_id: myProfile?.id,
        to_user_id: opponentIdOf(state),
        from_username: myDisplayName(myProfile),
        ...rematchTerms(state.gameData),
    });
    dispatch({ type: 'rematchStateSet', value: 'sent' });
}

export function acceptRematch({ socket, myProfile, state, dispatch }: CommandContext): void {
    socket?.emit('rematch_accept', {
        from_user_id: opponentIdOf(state),
        to_user_id: myProfile?.id,
        ...rematchTerms(state.gameData),
    });
    dispatch({ type: 'rematchStateSet', value: 'idle' });
}

export function declineRematch({ socket, myProfile, state, dispatch }: CommandContext): void {
    // LEGACY bug (preserved): addressed to MY OWN id, not the opponent's.
    const { myColor, gameData } = state;
    socket?.emit('rematch_decline', {
        to_user_id: myColor === 'white' ? gameData?.white_id : gameData?.black_id,
        by_username: myDisplayName(myProfile),
    });
    dispatch({ type: 'rematchStateSet', value: 'idle' });
}
