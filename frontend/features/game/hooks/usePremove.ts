'use client';

// Queuing a move while it is the opponent's turn (the "Premoves" setting, ADR F-153). The
// server holds the premove and plays it right after the opponent's move; this hook only
// handles the clicks: pick one of my pieces, then a destination (premove_set), and any click
// while a premove is queued cancels it (premove_cancel).
import type { Dispatch, MutableRefObject } from 'react';
import type { Chess, Square } from 'chess.js';
import type { Socket } from 'socket.io-client';
import { emitWithAck, rejectionMessage } from '@/lib/socket/ack';
import type { GameAction, GameState } from '../state/gameReducer';
import { premoveDests, premovePromotion } from '../utils/premoveDests';

export interface PremoveOptions {
    gameId: string;
    socket: Socket | null;
    state: GameState;
    dispatch: Dispatch<GameAction>;
    chessRef: MutableRefObject<Chess>;
    notify?: (message: string) => void;
    /** The "Premoves" setting. */
    enabled?: boolean;
}

/** The server says it is my turn after all: no message, the board simply lets me move. */
const SILENT_REFUSALS = new Set(['premove_your_turn']);

function cancel({ socket, gameId, dispatch }: PremoveOptions) {
    dispatch({ type: 'premoveCleared' });
    dispatch({ type: 'selectionCleared' });
    if (socket) emitWithAck(socket, 'premove_cancel', { game_id: gameId }, { onRejected: () => {} });
}

function queue(opts: PremoveOptions, from: Square, to: Square) {
    const { socket, gameId, dispatch, chessRef } = opts;
    const piece = chessRef.current.get(from);
    if (!piece || !socket) return;
    dispatch({ type: 'premoveQueued', premove: { from, to } });
    dispatch({ type: 'selectionCleared' });
    const promotion = premovePromotion(piece.type, to);
    emitWithAck(
        socket,
        'premove_set',
        { game_id: gameId, from, to, ...(promotion ? { promotion } : {}) },
        {
            onRejected: (code) => {
                dispatch({ type: 'premoveCleared' });
                if (!SILENT_REFUSALS.has(code)) opts.notify?.(rejectionMessage(code));
            },
        },
    );
}

/** True when a click on the board should queue or cancel a premove instead of moving. */
export function canPremove({ state, enabled }: PremoveOptions, myTurn: boolean): boolean {
    return Boolean(enabled) && state.myColor !== 'spectator' && !state.gameOver && state.viewIndex === null && !myTurn;
}

/** A board click while waiting for the opponent. */
export function premoveClick(opts: PremoveOptions, sq: Square): void {
    const { state, dispatch, chessRef } = opts;
    if (state.premove) return cancel(opts);
    if (state.selectedSq && state.legalDests.includes(sq)) return queue(opts, state.selectedSq, sq);
    const piece = chessRef.current.get(sq);
    const mine = state.myColor === 'white' ? 'w' : 'b';
    if (!piece || piece.color !== mine || state.myColor === 'spectator') {
        dispatch({ type: 'selectionCleared' });
        return;
    }
    dispatch({ type: 'squareSelected', square: sq, dests: premoveDests(sq, piece.type, state.myColor) });
}
