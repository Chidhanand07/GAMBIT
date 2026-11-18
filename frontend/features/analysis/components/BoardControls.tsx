import { Icon } from '@/components/ui/Icon';

const ROUND = 'flex h-12 w-12 items-center justify-center rounded-full border-1 border-line bg-surface p-0 text-ink';

const NAV = [
    { label: 'First move', path: 'M11 17l-5-5 5-5M18 17l-5-5 5-5' },
    { label: 'Previous move', path: 'M15 18l-6-6 6-6' },
    { label: 'Next move', path: 'M9 18l6-6-6-6' },
    { label: 'Last move', path: 'M13 17l5-5-5-5M6 17l5-5-5-5' },
] as const;

const FLIP = 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3';

interface BoardControlsProps {
    /** Ply shown on the board (-1 = start). */
    currentMoveIndex: number;
    total: number;
    onNavigate: (index: number) => void;
    onFlip: () => void;
}

/** Index each navigation button jumps to, clamped to the line. */
function targets(current: number, total: number): number[] {
    return [-1, Math.max(-1, current - 1), Math.min(total - 1, current + 1), total - 1];
}

/** First / previous / next / last and Flip board, with the position announced to screen readers. */
export function BoardControls({ currentMoveIndex, total, onNavigate, onFlip }: BoardControlsProps) {
    const to = targets(currentMoveIndex, total);
    let position = '';
    if (total > 0) position = currentMoveIndex < 0 ? 'Start' : `Move ${currentMoveIndex + 1} / ${total}`;
    return (
        <div className="flex flex-wrap items-center justify-center gap-[10px]">
            {NAV.map((b, i) => (
                <button
                    key={b.label}
                    type="button"
                    aria-label={b.label}
                    onClick={() => onNavigate(to[i])}
                    className={ROUND}
                >
                    <Icon path={b.path} size={20} />
                </button>
            ))}
            <button
                type="button"
                onClick={onFlip}
                className="flex min-h-[48px] items-center gap-2 rounded-pill border-1 border-line bg-surface px-5 text-[15px] font-semibold text-ink"
            >
                <Icon path={FLIP} size={18} />
                Flip board
            </button>
            <span role="status" className="sr-only">
                {position}
            </span>
        </div>
    );
}
