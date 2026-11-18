'use client';

// An opponent's request that waits for this player's answer (a draw offer), above the board so
// it shows in focus mode too. The mockup has none: it uses the status line's inset surface
// (GameNotice) and the game screen's pill buttons, [Decline, Accept] as in RematchPrompt.
import { GameNotice } from './StatusBanners';

export interface RequestPromptProps {
    /** e.g. "chiruparande offers a draw". */
    text: string;
    onAccept: () => void;
    onDecline: () => void;
}

const PILL = 'min-h-[36px] rounded-pill px-4 text-[14px]';

export function RequestPrompt({ text, onAccept, onDecline }: RequestPromptProps) {
    return (
        <GameNotice tone="accent">
            <span className="font-semibold">{text}</span>
            <span className="flex gap-2">
                <button
                    type="button"
                    onClick={onDecline}
                    className={`${PILL} border-1.5 border-line-muted bg-transparent font-semibold text-ink`}
                >
                    Decline
                </button>
                <button
                    type="button"
                    onClick={onAccept}
                    className={`${PILL} border-0 bg-accent font-bold text-on-accent`}
                >
                    Accept
                </button>
            </span>
        </GameNotice>
    );
}
