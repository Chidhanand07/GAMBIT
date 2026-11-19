import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/design/cn';
import type { RematchState } from '../state/gameReducer';
import type { GameStatus, StatusTone } from '../utils/gameStatus';
import type { ReactNode } from 'react';

const DOT: Record<StatusTone, string> = { move: 'bg-success', wait: 'bg-accent', over: 'bg-danger' };

const REMATCH_LABEL: Record<RematchState, string> = {
    idle: 'Rematch',
    received: 'Rematch',
    sent: 'Waiting…',
    declined: 'Declined',
};

export interface GameEndProps {
    /** Null for a spectator: no Rematch button. */
    rematchState: RematchState | null;
    onRematch: () => void;
    /** Omitted where the screen has its own New game button (offline). */
    onNewGame?: () => void;
}

interface ControlsCardProps {
    status: GameStatus;
    /** The action buttons (the live game's Flip / Draw / Resign grid). */
    children: ReactNode;
    /** Shown once the game is over (Game.dc.html result state). */
    end: GameEndProps | null;
}

function StatusLine({ status }: { status: GameStatus }) {
    return (
        <div
            aria-live="polite"
            className="flex items-center gap-3 rounded-14 border-1 border-line-subtle bg-bg-base px-[14px] py-3"
        >
            <span
                aria-hidden="true"
                className={cn('h-3 w-3 shrink-0 rounded-full shadow-turn-dot', DOT[status.tone])}
            />
            <span className="font-display text-[17px] font-semibold">{status.text}</span>
        </div>
    );
}

function GameEndButtons({ rematchState, onRematch, onNewGame }: GameEndProps) {
    const waiting = rematchState === 'sent' || rematchState === 'declined';
    return (
        <div className="flex flex-wrap gap-2">
            {rematchState && (
                <button
                    type="button"
                    onClick={onRematch}
                    disabled={waiting}
                    className="min-h-[52px] flex-[1_1_140px] rounded-pill border-0 bg-accent font-bold text-on-accent disabled:cursor-default"
                >
                    {REMATCH_LABEL[rematchState]}
                </button>
            )}
            {onNewGame && (
                <button
                    type="button"
                    onClick={onNewGame}
                    className="min-h-[52px] flex-[1_1_140px] rounded-pill border-1.5 border-line-muted bg-transparent font-semibold text-ink"
                >
                    New game
                </button>
            )}
        </div>
    );
}

/** Status line, Flip / Draw / Resign, and Rematch / New game after the result (Game.dc.html). */
export function ControlsCard({ status, children, end }: ControlsCardProps) {
    return (
        <Card className="flex flex-col gap-[14px]">
            <StatusLine status={status} />
            {children}
            {end && <GameEndButtons {...end} />}
        </Card>
    );
}
