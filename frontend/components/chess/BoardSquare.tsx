import { memo } from 'react';
import type { Square } from 'chess.js';
import { cn } from '@/lib/design/cn';

/**
 * Square tint, in Game.dc.html priority: last move < check < queued premove < selected <
 * capture target (the premove tint has no mockup state).
 */
export type SquareMark = 'none' | 'last' | 'check' | 'premove' | 'selected' | 'capture';

const MARKS: Record<Exclude<SquareMark, 'none'>, string> = {
    last: 'bg-mark-last',
    check: 'bg-mark-check',
    selected: 'bg-mark-selected',
    capture: 'bg-mark-capture',
    premove: 'bg-mark-premove',
};

/** Settings.dc.html's live preview draws the selected piece's square and its dots in green. */
const PREVIEW_SELECTED = 'bg-mark-preview-hint';
const DOT = 'left-[35%] top-[35%] h-[30%] w-[30%] bg-mark-dot';
const PREVIEW_DOT = 'left-[33%] top-[33%] h-[34%] w-[34%] bg-mark-preview-dot';

function markClass(mark: Exclude<SquareMark, 'none'>, preview: boolean): string {
    return preview && mark === 'selected' ? PREVIEW_SELECTED : MARKS[mark];
}

export interface BoardSquareProps {
    square: Square;
    /** Square background and coordinate colour classes (light squares get the dark ink). */
    fill: string;
    ink: string;
    mark: SquareMark;
    /** Legal destination without a piece: the centred dot. */
    dot: boolean;
    /** The Settings live-preview palette (green selection and dots). */
    preview?: boolean;
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
function BoardSquareView(props: BoardSquareProps) {
    const { square, fill, ink, mark, dot, preview = false, rankLabel, fileLabel, label, onClick } = props;
    const content = (
        <>
            {mark !== 'none' && (
                <span aria-hidden="true" data-mark={mark} className={cn('absolute inset-0', markClass(mark, preview))} />
            )}
            {dot && (
                <span aria-hidden="true" data-dot className={cn('absolute rounded-full', preview ? PREVIEW_DOT : DOT)} />
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
