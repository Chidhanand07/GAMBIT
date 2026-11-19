'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseComputerSetup } from '@/features/offline/setupParams';
import { Board } from '@/components/chess/Board';
import { MoveList } from '@/components/chess/MoveList';
import { GameLayout } from '@/features/game/components/GameLayout';
import { PromotionPicker } from '@/features/game/components/PromotionPicker';
import { preferredBoardProps } from '@/features/settings/boardProps';
import { useBoardPrefs } from '@/features/settings/SettingsProvider';
import { checkedKingSquare } from '@/lib/chess/board';
import { useComputerGame } from '@/features/offline/hooks/useComputerGame';
import { statusOf } from '@/features/offline/game';
import { SetupScreen } from '@/features/offline/components/SetupScreen';
import { EngineErrorBanner, OfflineBar, OfflineControls } from '@/features/offline/components/GamePanels';
import type { Square } from 'chess.js';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

/** /offline, or /offline?difficulty=&side= from the lobby (starts the game directly). */
export default function ComputerPage() {
    return (
        <Suspense>
            <ComputerGame />
        </Suspense>
    );
}

function ComputerGame() {
    const searchParams = useSearchParams();
    const preset = useMemo(() => parseComputerSetup(searchParams), [searchParams]);
    const { phase, difficulty, setDifficulty, colorChoice, setColorChoice, startGame, backToSetup, board } =
        useComputerGame(preset);
    const prefs = useBoardPrefs();
    const { game, playerColor, moveHistory, thinking, gameOver, engineError } = board;

    if (phase === 'setup') {
        return (
            <SetupScreen
                difficulty={difficulty}
                onDifficulty={setDifficulty}
                colorChoice={colorChoice}
                onColorChoice={setColorChoice}
                onStart={startGame}
            />
        );
    }

    const bars = { game, playerColor, difficulty, gameOver };
    const status = statusOf(game, playerColor, { resigned: board.resigned, gameOver, thinking });
    return (
        <GameLayout
            focus={false}
            title="Game vs MAVERICK"
            subtitle={`Computer · ${DIFFICULTY_LABEL[difficulty]} · you play ${playerColor === 'w' ? 'White' : 'Black'}`}
            pills={['Unrated', 'Computer']}
            board={
                <>
                    {engineError && (
                        <EngineErrorBanner
                            error={engineError}
                            canRetry={board.canRetryEngine}
                            onRetry={board.retryEngine}
                        />
                    )}
                    <OfflineBar {...bars} position="top" />
                    <Board
                        fen={game.fen()}
                        orientation={playerColor === 'w' ? 'white' : 'black'}
                        selectedSquare={board.selectedSquare as Square | null}
                        {...preferredBoardProps(prefs, {
                            lastMove: board.lastMove as { from: Square; to: Square } | null,
                            legalDestinations: board.legalMoves as Square[],
                        })}
                        checkSquare={checkedKingSquare(game)}
                        onSquareClick={board.handleSquareClick}
                    >
                        {board.pendingPromotion && <PromotionPicker color={playerColor} onSelect={board.promote} />}
                    </Board>
                    <OfflineBar {...bars} position="bottom" />
                </>
            }
            aside={
                <>
                    <OfflineControls
                        status={status}
                        gameOver={gameOver}
                        undoDisabled={!board.canTakeBack || gameOver}
                        onUndo={board.undoMove}
                        onResign={board.resign}
                        onNewGame={backToSetup}
                        onRematch={startGame}
                    />
                    <MoveList moves={moveHistory} className="flex-1" />
                </>
            }
        />
    );
}
