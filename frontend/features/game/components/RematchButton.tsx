'use client';

import type { RematchState } from '../state/gameReducer';

export default function RematchButton({
    rematchState,
    onRematch,
}: {
    rematchState: RematchState;
    onRematch: () => void;
}) {
    if (rematchState === 'sent') {
        return (
            <button
                disabled
                className="py-2.5 bg-surface border border-border text-text-tertiary font-medium text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-default"
            >
                <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="animate-spin"
                >
                    <circle cx="12" cy="12" r="10" />
                </svg>
                Waiting…
            </button>
        );
    }
    if (rematchState === 'declined') {
        return (
            <button
                disabled
                className="py-2.5 bg-surface border border-red-500/30 text-red-400 font-medium text-sm rounded-xl flex items-center justify-center cursor-default"
            >
                Declined
            </button>
        );
    }
    return (
        <button
            onClick={onRematch}
            className="py-2.5 bg-surface hover:bg-hover border border-border text-text-primary font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-1.5"
        >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            Rematch
        </button>
    );
}
