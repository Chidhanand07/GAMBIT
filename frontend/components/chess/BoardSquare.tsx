import { memo } from 'react';
import type { Square } from 'chess.js';
import { cn } from '@/lib/design/cn';

/** Square tint, in Game.dc.html priority: last move < check < selected < capture target. */
export type SquareMark = 'none' | 'last' | 'check' | 'selected' | 'capture';

const MARKS: Record<Exclude<SquareMark, 'none'>, string> = {
    last: 'bg-mark-last',
    check: 'bg-mark-check',
    selected: 'bg-mark-selected',
    capture: 'bg-mark-capture',
};

export interface BoardSquareProps {
    square: Square;
    /** Square background and coordinate colour classes (light squares get the dark ink). */
    fill: string;
    ink: string;
    mark: SquareMark;
    /** Legal destination without a piece: the centred dot. */
    dot: boolean;
    rankLabel: string | null;
    fileLabel: string | null;
    /** Accessible name when interactive, e.g. "e4, white knight". */
    label: string;
    onClick?: (square: Square) => void;
}

/**
 * One board square. Memoised on primitive props, so a move re-renders only the squares whose
 * tint, dot, label or piece name changed.
 */
function BoardSquareView({ square, fill, ink, mark, dot, rankLabel, fileLabel, label, onClick }: BoardSquareProps) {
    const content = (
        <>
            {mark !== 'none' && (
                <span aria-hidden="true" data-mark={mark} className={cn('absolute inset-0', MARKS[mark])} />
            )}
            {dot && (
                <span
                    aria-hidden="true"
                    data-dot
                    className="absolute left-[35%] top-[35%] h-[30%] w-[30%] rounded-full bg-mark-dot"
                />
            )}
            {rankLabel && (
                <span
                    aria-hidden="true"
                    className={cn('absolute left-[3px] top-[1px] text-[9px] font-bold leading-normal', ink)}
                >
                    {rankLabel}
                </span>
            )}
            {fileLabel && (
                <span
                    aria-hidden="true"
                    className={cn('absolute bottom-0 right-[3px] text-[9px] font-bold leading-normal', ink)}
                >
                    {fileLabel}
                </span>
            )}
        </>
    );
    if (!onClick)
        return (
            <span data-square={square} className={cn('relative', fill)}>
                {content}
            </span>
        );
    return (
        <button
            type="button"
            data-square={square}
            aria-label={label}
            aria-pressed={mark === 'selected'}
            onClick={() => onClick(square)}
            className={cn('relative cursor-pointer border-0 p-0', fill)}
        >
            {content}
        </button>
    );
}

export const BoardSquare = memo(BoardSquareView);
