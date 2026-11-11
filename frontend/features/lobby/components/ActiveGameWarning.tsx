interface ActiveGameWarningProps {
    onReturn: () => void;
    onStay: () => void;
}

/** Modal shown when Play Online is pressed while a game is still running. */
export function ActiveGameWarning({ onReturn, onStay }: ActiveGameWarningProps) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onStay} />
            <div
                className="relative rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-accent)' }}
            >
                <div className="p-6 text-center">
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                    >
                        <svg
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--accent)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        >
                            <path d="M9 18 4.5 15V9l7.5-4.5L19.5 9v6L12 19.5" />
                            <path d="M12 12v4M12 8h.01" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Game already in progress
                    </h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                        You have an active match running. Please finish or resign it before starting a new game.
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={onReturn}
                            className="w-full py-3 rounded-xl font-semibold text-sm btn-press transition-all"
                            style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                        >
                            Return to my game →
                        </button>
                        <button
                            onClick={onStay}
                            className="w-full py-2.5 rounded-xl text-sm transition-colors"
                            style={{ color: 'var(--text-tertiary)' }}
                        >
                            Stay here
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
