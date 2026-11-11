import Link from 'next/link';
import type { ReviewStatus } from '../hooks/useGameReview';
import type { ReactNode } from 'react';

export const Ctrl = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button
        onClick={onClick}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border-strong text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
    >
        {children}
    </button>
);

const Centered = ({ children }: { children: ReactNode }) => (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">{children}</div>
);

const Spinner = () => <div className="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin" />;

/** Loading, error and "analysing" screens shown before the review is ready. */
export function ReviewStatusScreen({ status }: { status: ReviewStatus }) {
    if (status === 'loading')
        return (
            <Centered>
                <Spinner />
                <p className="text-text-secondary">Loading game…</p>
            </Centered>
        );
    if (status === 'error')
        return (
            <Centered>
                <p className="text-text-secondary">Couldn&apos;t load this game.</p>
                <Link href="/lobby" className="text-accent">
                    Back to lobby
                </Link>
            </Centered>
        );
    return (
        <Centered>
            <Spinner />
            <h2 className="text-xl text-text-primary">Analysing your game…</h2>
            <p className="text-text-secondary text-sm">Stockfish depth 18 is reviewing every move.</p>
        </Centered>
    );
}
