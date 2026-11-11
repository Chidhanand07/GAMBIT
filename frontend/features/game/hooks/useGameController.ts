'use client';

// Composition root of the live game page: state, refs, effects (in the legacy order) and commands.
import { useReducer, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';
import type { GameWithPlayers } from '@/types/game';
import { createInitialGameState, gameReducer } from '../state/gameReducer';
import { bindGameCommands } from './gameCommands';
import { useChessBoard } from './useChessBoard';
import { useGameClock } from './useGameClock';
import { useGameData } from './useGameData';
import { useGameOverModalDelay, useMoveListAutoScroll } from './useGameEffects';
import { useGameSocket } from './useGameSocket';
import { useMoveHistory } from './useMoveHistory';
import { useOpponentDisconnect } from './useOpponentDisconnect';

function useGameRefs() {
    return {
        chessRef: useRef(new Chess()),
        gameDataRef: useRef<GameWithPlayers | null>(null),
        clockSyncedRef: useRef(false),
        lastProcessedFenRef: useRef<string | null>(null),
        moveListRef: useRef<HTMLDivElement>(null),
    };
}

export function useGameController(gameId: string) {
    const router = useRouter();
    const socket = useSocket();
    const { profile: myProfile } = useProfile();
    const [state, dispatch] = useReducer(gameReducer, undefined, createInitialGameState);
    const { moveListRef, ...refs } = useGameRefs();
    const { chessRef, gameDataRef, clockSyncedRef, lastProcessedFenRef } = refs;
    const disconnect = useOpponentDisconnect();
    const board = useChessBoard({ gameId, socket, state, dispatch, chessRef, gameDataRef });
    const { myColor, soundOn, gameOver, gameData } = state;
    const { markDisconnected, markReconnected, opponentDisconnected } = disconnect;

    useMoveHistory({ gameId, state, chessRef, dispatch });
    useGameData({ gameId, myProfile, gameData, soundOn, router, refs, dispatch });
    useMoveListAutoScroll(moveListRef, state.moveList, board.isLive);
    useGameOverModalDelay(gameOver, dispatch);
    useGameSocket({
        ...{ socket, myProfile, gameId, myColor, soundOn, router, dispatch },
        ...{ chessRef, clockSyncedRef, lastProcessedFenRef, markDisconnected, markReconnected },
    });
    useGameClock({
        fen: state.fen,
        gameOver,
        gameData,
        opponentDisconnected,
        clockActive: state.clockActive,
        dispatch,
    });

    return {
        state,
        board,
        disconnect,
        liveChess: chessRef.current,
        moveListRef,
        ...bindGameCommands({ socket, myProfile, gameId, state, dispatch, board, router }),
    };
}

export type GameController = ReturnType<typeof useGameController>;
