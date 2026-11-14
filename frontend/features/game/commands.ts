// Player commands that emit to the realtime server: chat, resign, rematch request/accept/decline.
// The server knows who is acting from the socket handshake, so payloads only name the *other*
// player. A rematch accept/decline names the requester; the server answers the request it stored.
import type { Dispatch } from 'react';
import type { Socket } from 'socket.io-client';
import { emitWithAck, rejectionMessage } from '@/lib/socket/ack';
import type { Profile } from '@/types/profile';
import { rematchTerms } from './payloads';
import type { GameAction, GameState } from './state/gameReducer';

export interface CommandContext {
    socket: Socket | null;
    myProfile: Profile | null;
    gameId: string;
    state: GameState;
    dispatch: Dispatch<GameAction>;
    /** Shows the player a short message (a toast); used when the server refuses a command. */
    notify?: (message: string) => void;
}

/**
 * Emit and wait for the ack, with the timeout and retry rule of lib/socket/ack (F-065): tell the
 * player when the server refused or never answered, then run `then` (ACKS, NODE-13).
 */
function send(ctx: CommandContext, event: string, payload: unknown, then?: () => void): void {
    if (!ctx.socket) return;
    emitWithAck(ctx.socket, event, payload, {
        onRejected: (code) => {
            ctx.notify?.(rejectionMessage(code));
            then?.();
        },
    });
}

export function sendChat(ctx: CommandContext): void {
    const { socket, myProfile, gameId, state, dispatch } = ctx;
    if (!state.chatMsg.trim() || !myProfile || !socket) return;
    send(ctx, 'send_message', { game_id: gameId, from: myProfile.username, text: state.chatMsg.trim() });
    // Not added locally: the server broadcasts back to the whole room including the sender.
    dispatch({ type: 'chatDraftChanged', text: '' });
}

/**
 * Asks the server to resign this player's side. The page does not declare the result itself:
 * the server ends the game and its `game_end` (to both players) is what shows "You Lost".
 */
export function resign(ctx: CommandContext): void {
    const { socket, myProfile, gameId, state, dispatch } = ctx;
    if (!socket || !myProfile || state.gameOver) return;
    dispatch({ type: 'resignConfirmSet', value: false });
    send(ctx, 'resign', { game_id: gameId });
}

const opponentIdOf = ({ myColor, gameData }: GameState) =>
    myColor === 'white' ? gameData?.black_id : gameData?.white_id;

const myDisplayName = (p: Profile | null) => p?.display_name || p?.username;

export function requestRematch(ctx: CommandContext): void {
    const { myProfile, state, dispatch } = ctx;
    dispatch({ type: 'rematchStateSet', value: 'sent' });
    send(
        ctx,
        'rematch_request',
        { to_user_id: opponentIdOf(state), from_username: myDisplayName(myProfile), ...rematchTerms(state.gameData) },
        () => dispatch({ type: 'rematchStateSet', value: 'idle' }),
    );
}

export function acceptRematch(ctx: CommandContext): void {
    const { state, dispatch } = ctx;
    // Terms are not sent: the server uses the ones stored with the request.
    send(ctx, 'rematch_accept', { from_user_id: opponentIdOf(state) });
    dispatch({ type: 'rematchStateSet', value: 'idle' });
}

export function declineRematch(ctx: CommandContext): void {
    const { state, dispatch } = ctx;
    send(ctx, 'rematch_decline', { from_user_id: opponentIdOf(state) });
    dispatch({ type: 'rematchStateSet', value: 'idle' });
}
