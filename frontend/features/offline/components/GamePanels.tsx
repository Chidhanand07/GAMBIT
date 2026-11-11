import { Cpu, Flag, RotateCcw, Undo2 } from 'lucide-react';
import type { Difficulty, Side } from '../types';

export function MaverickHeader({ difficulty, thinking }: { difficulty: Difficulty; thinking: boolean }) {
    return (
        <div className="flex items-center justify-between bg-surface p-3 rounded-t-xl border border-border-strong px-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent/15 rounded-full flex items-center justify-center">
                    <Cpu size={20} className="text-accent" />
                </div>
                <div>
                    <span className="font-medium">MAVERICK</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-text-tertiary">{difficulty}</span>
                </div>
            </div>
            {thinking && (
                <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <span
                        className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
                    />
                    Thinking…
                </span>
            )}
        </div>
    );
}

interface GameOverProps {
    resultText: string;
    onRematch: () => void;
    onNewSetup: () => void;
}

export function GameOverOverlay({ resultText, onRematch, onNewSetup }: GameOverProps) {
    return (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
            <div className="bg-surface border border-border p-6 rounded-xl text-center space-y-4">
                <h2 className="text-2xl font-bold text-accent">Game Over</h2>
                <p className="text-text-primary">{resultText}</p>
                <div className="flex gap-2">
                    <button
                        onClick={onRematch}
                        className="bg-accent text-surface px-5 py-2 rounded-lg font-medium hover:bg-accent-hover transition-colors"
                    >
                        Rematch
                    </button>
                    <button
                        onClick={onNewSetup}
                        className="bg-elevated border border-border-strong px-5 py-2 rounded-lg font-medium hover:bg-hover transition-colors"
                    >
                        New Setup
                    </button>
                </div>
            </div>
        </div>
    );
}

export function PlayerFooter({ playerColor, yourMove }: { playerColor: Side; yourMove: boolean }) {
    const isWhite = playerColor === 'w';
    return (
        <div className="flex items-center justify-between bg-surface p-3 rounded-b-xl border border-border-strong px-4">
            <div className="flex items-center gap-3">
                <div
                    className="w-10 h-10 bg-elevated rounded-full flex items-center justify-center border border-border-strong text-lg font-bold"
                    style={{ color: isWhite ? '#fff' : '#111', WebkitTextStroke: isWhite ? '1px #000' : undefined }}
                >
                    {isWhite ? '♔' : '♚'}
                </div>
                <span className="font-medium">You</span>
            </div>
            <span className="text-xs text-text-tertiary">{yourMove ? 'Your move' : ''}</span>
        </div>
    );
}

const ACTION_CLASS =
    'flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary disabled:opacity-50 py-3 rounded-lg transition-colors font-medium';
const NEW_GAME_CLASS =
    'flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-hover border border-border-strong text-text-secondary hover:text-text-primary py-3 rounded-lg transition-colors font-medium';

interface ActionsProps {
    undoDisabled: boolean;
    gameOver: boolean;
    onUndo: () => void;
    onResign: () => void;
    onNewGame: () => void;
}

export function GameActions({ undoDisabled, gameOver, onUndo, onResign, onNewGame }: ActionsProps) {
    return (
        <div className="flex gap-3 mt-6">
            <button onClick={onUndo} disabled={undoDisabled} className={ACTION_CLASS}>
                <Undo2 size={18} strokeWidth={1.5} /> Takeback
            </button>
            <button onClick={onResign} disabled={gameOver} className={ACTION_CLASS}>
                <Flag size={18} strokeWidth={1.5} /> Resign
            </button>
            <button onClick={onNewGame} className={NEW_GAME_CLASS}>
                <RotateCcw size={18} strokeWidth={1.5} /> New Game
            </button>
        </div>
    );
}

export function MoveLog({ moveHistory }: { moveHistory: string[] }) {
    return (
        <div className="w-full lg:w-[300px]">
            <div className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden max-h-[500px]">
                <div className="p-4 border-b border-border bg-elevated font-medium">Moves</div>
                <div className="p-4 overflow-y-auto space-y-1">
                    {moveHistory.length === 0 ? (
                        <p className="text-text-tertiary text-sm italic">No moves yet.</p>
                    ) : null}
                    {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                        <div key={i} className="flex gap-4 text-sm font-mono">
                            <span className="w-6 text-text-tertiary text-right">{i + 1}.</span>
                            <span className="w-16 text-text-primary">{moveHistory[i * 2]}</span>
                            <span className="w-16 text-text-secondary">{moveHistory[i * 2 + 1] || ''}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
