'use client';

import { displayTimeControl } from '@/lib/chess/timeControl';

// Incoming rematch request, bottom right. The mockup has none: it uses the header popover's
// surface and the game screen's pill buttons. Buttons: [decline, accept].
export interface RematchPromptProps {
    fromUser: string;
    timeControl: string;
    isRated: boolean;
    onDecline: () => void;
    onAccept: () => void;
}

export default function RematchPrompt({ fromUser, timeControl, isRated, onDecline, onAccept }: RematchPromptProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-[300] box-border flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-20 border-1 border-line bg-surface-header p-4 text-ink shadow-popover"
        >
            <div className="flex flex-col">
                <span className="font-semibold">{fromUser} wants a rematch</span>
                <span className="text-[13px] text-ink-muted">
                    {displayTimeControl(timeControl)} · {isRated ? 'Rated' : 'Unrated'}
                </span>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onDecline}
                    className="min-h-[44px] flex-1 rounded-pill border-1.5 border-line-muted bg-transparent font-semibold text-ink"
                >
                    Decline
                </button>
                <button
                    type="button"
                    onClick={onAccept}
                    className="min-h-[44px] flex-1 rounded-pill border-0 bg-accent font-bold text-on-accent"
                >
                    Accept
                </button>
            </div>
        </div>
    );
}
