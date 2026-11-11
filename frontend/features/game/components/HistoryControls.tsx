'use client';

// First / previous / next / live buttons under the move list.
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { stepBackIndex, stepForwardIndex } from '../utils/history';

const ICON = { size: 15, strokeWidth: 1.5 };
const BUTTON =
    'p-2 rounded hover:bg-elevated text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors';

export interface HistoryControlsProps {
    viewIndex: number | null;
    snapshotCount: number;
    isLive: boolean;
    goToMove: (index: number | null) => void;
}

export default function HistoryControls({ viewIndex, snapshotCount, isLive, goToMove }: HistoryControlsProps) {
    const empty = snapshotCount === 0;
    return (
        <div className="border-t border-border p-2 flex items-center justify-center gap-1 shrink-0">
            <button onClick={() => goToMove(0)} disabled={empty} className={BUTTON}>
                <SkipBack {...ICON} />
            </button>
            <button
                onClick={() => goToMove(stepBackIndex(viewIndex, snapshotCount))}
                disabled={empty}
                className={BUTTON}
            >
                <ChevronLeft {...ICON} />
            </button>
            <button
                onClick={() => goToMove(stepForwardIndex(viewIndex, snapshotCount))}
                disabled={isLive && empty}
                className={BUTTON}
            >
                <ChevronRight {...ICON} />
            </button>
            <button onClick={() => goToMove(null)} disabled={isLive} className={BUTTON}>
                <SkipForward {...ICON} />
            </button>
        </div>
    );
}
