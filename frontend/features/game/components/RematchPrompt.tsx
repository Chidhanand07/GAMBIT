'use client';

// Incoming rematch toast (bottom-right). Buttons: [decline, accept].
export interface RematchPromptProps {
    fromUser: string;
    timeControl: string;
    isRated: boolean;
    onDecline: () => void;
    onAccept: () => void;
}

export default function RematchPrompt({ fromUser, timeControl, isRated, onDecline, onAccept }: RematchPromptProps) {
    return (
        <div className="fixed bottom-6 right-6 z-[300] w-72 animate-in slide-in-from-bottom-3 fade-in duration-200">
            <div
                className="rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-5"
                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-accent)' }}
            >
                <div className="text-text-primary font-semibold text-sm mb-0.5">{fromUser} wants a rematch</div>
                <div className="text-text-tertiary text-xs mb-4">
                    {timeControl} min · {isRated ? 'Rated' : 'Unrated'}
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onDecline}
                        className="flex-1 py-2.5 bg-surface hover:bg-hover border border-border rounded-xl text-text-secondary transition-colors flex items-center justify-center"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                        >
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex-1 py-2.5 bg-accent hover:bg-accent-hover rounded-xl text-surface transition-colors flex items-center justify-center"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                        >
                            <path d="M20 6 9 17l-5-5" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
