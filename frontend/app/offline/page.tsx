'use client';

import { useComputerGame } from '@/features/offline/hooks/useComputerGame';
import { resultText } from '@/features/offline/game';
import { SetupScreen } from '@/features/offline/components/SetupScreen';
import { ComputerBoard } from '@/features/offline/components/ComputerBoard';
import {
    GameActions,
    GameOverOverlay,
    MaverickHeader,
    MoveLog,
    PlayerFooter,
} from '@/features/offline/components/GamePanels';

export default function ComputerPage() {
    const { phase, difficulty, setDifficulty, colorChoice, setColorChoice, startGame, backToSetup, board } =
        useComputerGame();
    const { game, playerColor, moveHistory, thinking, gameOver, engineError } = board;

    // ── SETUP SCREEN ──────────────────────────────────────────────────────────
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

    // ── GAME SCREEN ───────────────────────────────────────────────────────────
    return (
        <div className="max-w-6xl mx-auto px-4 py-6 text-text-primary mb-12">
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 max-w-[600px] mx-auto w-full">
                    <MaverickHeader difficulty={difficulty} thinking={thinking} />

                    <div className="w-full relative shadow-[-10px_10px_30px_rgba(0,0,0,0.5)] border-[12px] border-[#2E2B25] rounded-sm">
                        <ComputerBoard
                            game={game}
                            playerColor={playerColor}
                            selectedSquare={board.selectedSquare}
                            legalMoves={board.legalMoves}
                            lastMove={board.lastMove}
                            onSquareClick={board.handleSquareClick}
                        />
                        {gameOver && (
                            <GameOverOverlay
                                resultText={resultText(game, playerColor, board.resigned)}
                                onRematch={startGame}
                                onNewSetup={backToSetup}
                            />
                        )}
                    </div>

                    <PlayerFooter playerColor={playerColor} yourMove={game.turn() === playerColor && !gameOver} />

                    {engineError && (
                        <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                            {engineError}
                        </div>
                    )}

                    <GameActions
                        undoDisabled={moveHistory.length === 0 || thinking || gameOver}
                        gameOver={gameOver}
                        onUndo={board.undoMove}
                        onResign={board.resign}
                        onNewGame={backToSetup}
                    />
                </div>

                <MoveLog moveHistory={moveHistory} />
            </div>
        </div>
    );
}
