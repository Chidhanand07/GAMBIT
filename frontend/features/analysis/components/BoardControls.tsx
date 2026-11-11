import { ChevronLeft, ChevronRight, FlipHorizontal2, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { panelSurface, textHover } from '../styles';

interface BoardControlsProps {
    currentMoveIndex: number;
    total: number;
    onNavigate: (index: number) => void;
    onFlip: () => void;
    onReset: () => void;
}

const squareButton = 'w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-hover';
const squareButtonStyle = { ...panelSurface, color: 'var(--text-secondary)' };

/** First / previous / next / last, the move counter, flip and reset. */
export function BoardControls({ currentMoveIndex, total, onNavigate, onFlip, onReset }: BoardControlsProps) {
    const buttons = [
        { icon: <SkipBack size={15} strokeWidth={1.5} />, action: () => onNavigate(-1), title: 'First' },
        {
            icon: <ChevronLeft size={15} strokeWidth={1.5} />,
            action: () => onNavigate(Math.max(-1, currentMoveIndex - 1)),
            title: 'Previous',
        },
        {
            icon: <ChevronRight size={15} strokeWidth={1.5} />,
            action: () => onNavigate(Math.min(total - 1, currentMoveIndex + 1)),
            title: 'Next',
        },
        { icon: <SkipForward size={15} strokeWidth={1.5} />, action: () => onNavigate(total - 1), title: 'Last' },
    ];
    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl p-1 gap-0.5" style={panelSurface}>
                {buttons.map((b, i) => (
                    <button
                        key={i}
                        onClick={b.action}
                        title={b.title}
                        className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-hover"
                        style={{ color: 'var(--text-secondary)' }}
                        {...textHover}
                    >
                        {b.icon}
                    </button>
                ))}
            </div>

            {total > 0 && (
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)', minWidth: 70 }}>
                    {currentMoveIndex < 0 ? 'Start' : `Move ${currentMoveIndex + 1} / ${total}`}
                </span>
            )}

            <button
                onClick={onFlip}
                title="Flip board"
                className={squareButton}
                style={squareButtonStyle}
                {...textHover}
            >
                <FlipHorizontal2 size={15} strokeWidth={1.5} />
            </button>

            <button
                onClick={onReset}
                title="Reset board"
                className={squareButton}
                style={squareButtonStyle}
                {...textHover}
            >
                <RotateCcw size={14} strokeWidth={1.5} />
            </button>
        </div>
    );
}
