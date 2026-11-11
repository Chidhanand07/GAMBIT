'use client';

// Board interaction: the displayed position (live or history), turn check, square clicks,
// promotion, and committing a move (optimistic local update + make_move / game_end emits).
import { useMemo, type Dispatch, type MutableRefObject } from 'react';
import { Chess, type Color, type Square } from 'chess.js';
import type { Socket } from 'socket.io-client';
import { playGameEndSound } from '@/lib/sounds';
import type { GameWithPlayers } from '@/types/game';
import { gameEndPayload } from '../payloads';
import type { GameAction, GameState } from '../state/gameReducer';
import { detectGameOver, isPromotionMove, playMoveSoundFor } from '../utils/moveEffects';

interface Options {
    gameId: string;
    socket: Socket | null;
    state: GameState;
    dispatch: Dispatch<GameAction>;
    chessRef: MutableRefObject<Chess>;
    gameDataRef: MutableRefObject<GameWithPlayers | null>;
}

export interface ChessBoardControls {
    displayChess: Chess;
    isLive: boolean;
    isMyTurn: () => boolean;
    commitMove: (from: Square, to: Square, promotion: string) => void;
    handleSquareClick: (sq: Square) => void;
    goToMove: (index: number | null) => void;
}

function useDisplayChess(state: GameState): Chess {
    const displayFen = state.viewIndex !== null ? state.fenSnapshots[state.viewIndex] : state.fen;
    return useMemo(() => {
        const c = new Chess();
        try {
            c.load(displayFen);
        } catch {
            /* ignore */
        }
        return c;
    }, [displayFen]);
}

/** Plays the move locally, emits make_move, then (if it ended the game) game_end. */
function commitMoveWith(opts: Options, from: Square, to: Square, promotion: string): void {
    const { gameId, socket, dispatch, state } = opts;
    const chess = opts.chessRef.current;
    const moveObj = chess.move({ from, to, promotion });
    if (!moveObj) return;
    const newFen = chess.fen();
    dispatch({ type: 'moveCommitted', fen: newFen, from, to });
    socket?.emit('make_move', {
        game_id: gameId,
        from,
        to,
        promotion,
        fen: newFen,
        san: moveObj.san,
        captured: !!moveObj.captured,
    });
    if (state.soundOn) playMoveSoundFor(chess, moveObj.flags, moveObj.captured);
    const outcome = detectGameOver(chess);
    if (!outcome) return;
    dispatch({ type: 'gameEnded', info: outcome });
    socket?.emit('game_end', gameEndPayload(gameId, outcome, opts.gameDataRef.current));
    if (state.soundOn) playGameEndSound(outcome.result.toLowerCase().startsWith(state.myColor));
}

export function useChessBoard(opts: Options): ChessBoardControls {
    const { state, dispatch, chessRef } = opts;
    const { myColor, gameOver, selectedSq, legalDests } = state;
    const displayChess = useDisplayChess(state);
    const isLive = state.viewIndex === null;

    const isMyTurn = () => {
        if (myColor === 'spectator' || gameOver || !isLive) return false;
        const turn = chessRef.current.turn();
        return (turn === 'w' && myColor === 'white') || (turn === 'b' && myColor === 'black');
    };

    const commitMove = (from: Square, to: Square, promotion: string) => commitMoveWith(opts, from, to, promotion);

    const tryMoveTo = (from: Square, sq: Square) => {
        if (isPromotionMove(chessRef.current.get(from), sq)) {
            dispatch({ type: 'promotionPending', move: { from, to: sq } });
            return;
        }
        commitMove(from, sq, 'q');
    };

    const handleSquareClick = (sq: Square) => {
        if (!isMyTurn()) return;
        const chess = chessRef.current;
        if (selectedSq) {
            if (legalDests.includes(sq)) return tryMoveTo(selectedSq, sq);
            dispatch({ type: 'selectionCleared' });
        }
        const piece = chess.get(sq);
        const myColorCode: Color = myColor === 'white' ? 'w' : 'b';
        if (piece && piece.color === myColorCode) {
            const dests = chess.moves({ square: sq, verbose: true }).map((m) => m.to as Square);
            dispatch({ type: 'squareSelected', square: sq, dests });
        }
    };

    const goToMove = (index: number | null) => dispatch({ type: 'historyViewed', index });

    return { displayChess, isLive, isMyTurn, commitMove, handleSquareClick, goToMove };
}
