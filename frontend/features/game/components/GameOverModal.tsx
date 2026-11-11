'use client';

// Game-over modal centred over the board column: outcome, reason, my rating change, next actions.
import { Crown, Trophy } from 'lucide-react';
import type { SeatColor } from '@/types/game';
import type { GameOverInfo, RematchState } from '../state/gameReducer';
import { CrossIcon } from './icons';
import RematchButton from './RematchButton';

export interface GameOverModalProps {
    gameOver: GameOverInfo;
    myColor: SeatColor;
    /** My rating change (null for spectators or before rating_updated). */
    ratingChange: number | null;
    rematchState: RematchState;
    onClose: () => void;
    onReview: () => void;
    onNewGame: () => void;
    onRematch: () => void;
}

const setColor = (color: string) => (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.color = color;
};

interface OutcomeFlags {
    isSpectator: boolean;
    isWin: boolean;
    isDraw: boolean;
    isLoss: boolean;
}

/** Win/draw/loss from my seat; a spectator is neither a win nor a loss (a draw can still apply). */
export function outcomeFlags(result: string, myColor: SeatColor): OutcomeFlags {
    const isSpectator = myColor === 'spectator';
    const isWin = !isSpectator && result.toLowerCase().startsWith(myColor);
    const isDraw = result.toLowerCase().includes('draw');
    return { isSpectator, isWin, isDraw, isLoss: !isSpectator && !isWin && !isDraw };
}

function outcomeBackground({ isWin, isDraw }: OutcomeFlags): string {
    if (isWin) return 'var(--accent-dim)';
    return isDraw ? 'var(--bg-surface)' : 'rgba(192,57,43,0.1)';
}

function OutcomeIcon({ isSpectator, isWin, isDraw, isLoss }: OutcomeFlags) {
    return (
        <>
            {isWin && <Crown size={24} className="text-accent" strokeWidth={1.5} />}
            {isDraw && (
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-secondary)"
                    strokeWidth="1.5"
                >
                    <path d="M5 12h14" />
                    <path d="M5 8h14" />
                    <path d="M5 16h14" />
                </svg>
            )}
            {isLoss && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            )}
            {isSpectator && <Trophy size={24} className="text-accent" strokeWidth={1.5} />}
        </>
    );
}

function outcomeTitle(flags: OutcomeFlags, result: string): string {
    if (flags.isSpectator) return result;
    if (flags.isWin) return 'You Win!';
    return flags.isDraw ? 'Draw' : 'You Lost';
}

function Outcome({ gameOver, myColor }: Pick<GameOverModalProps, 'gameOver' | 'myColor'>) {
    const flags = outcomeFlags(gameOver.result, myColor);
    return (
        <div className="flex flex-col items-center gap-2 mb-3">
            <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: outcomeBackground(flags) }}
            >
                <OutcomeIcon {...flags} />
            </div>
            <div className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {outcomeTitle(flags, gameOver.result)}
            </div>
        </div>
    );
}

function RatingLine({ change }: { change: number | null }) {
    if (change === null) return null;
    const positive = change >= 0;
    return (
        <div className={`mt-2 text-base font-semibold tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`}>
            Rating {positive ? '+' : ''}
            {change}
        </div>
    );
}

export default function GameOverModal(props: GameOverModalProps) {
    const { gameOver, myColor } = props;
    return (
        <div className="absolute inset-0 z-[200] flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto relative bg-elevated border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] w-full max-w-[320px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="relative px-6 pt-6 pb-4 text-center border-b border-border/60">
                    <button
                        onClick={props.onClose}
                        className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
                        onMouseEnter={setColor('var(--text-primary)')}
                        onMouseLeave={setColor('var(--text-tertiary)')}
                    >
                        <CrossIcon size={13} />
                    </button>
                    <Outcome gameOver={gameOver} myColor={myColor} />
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        by {gameOver.reason}
                    </div>
                    {myColor !== 'spectator' && <RatingLine change={props.ratingChange} />}
                </div>

                {/* Buttons */}
                <div className="p-4 space-y-2.5">
                    <button
                        onClick={props.onReview}
                        className="w-full py-3 bg-accent hover:bg-accent-hover text-surface font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                        </svg>
                        Game Review
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={props.onNewGame}
                            className="py-2.5 bg-surface hover:bg-hover border border-border text-text-primary font-medium text-sm rounded-xl transition-colors text-center"
                        >
                            + New Game
                        </button>
                        {myColor !== 'spectator' ? (
                            <RematchButton rematchState={props.rematchState} onRematch={props.onRematch} />
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
