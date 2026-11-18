import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ReviewStatus } from '../hooks/useGameReview';

interface CtrlProps {
    label: string;
    iconPath: string;
    onClick: () => void;
}

/** A round 44px icon button (the game screen's pill-button surface). */
export const Ctrl = ({ label, iconPath, onClick }: CtrlProps) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="flex h-11 w-11 items-center justify-center rounded-pill border-1.5 border-line bg-bg-base text-ink"
    >
        <Icon path={iconPath} size={18} />
    </button>
);

const Centered = ({ children }: { children: ReactNode }) => (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-ink">{children}</div>
);

const Spinner = () => (
    <div aria-hidden="true" className="h-12 w-12 animate-spin rounded-full border-4 border-line border-t-accent" />
);

/** Loading, error and "analysing" screens shown before the review is ready. */
export function ReviewStatusScreen({ status, onRetry }: { status: ReviewStatus; onRetry: () => void }) {
    if (status === 'loading')
        return (
            <Centered>
                <Spinner />
                <p className="text-ink-muted">Loading game…</p>
            </Centered>
        );
    if (status === 'error')
        return (
            <Centered>
                <p className="text-ink-muted">Couldn&apos;t load this game.</p>
                <Button onClick={onRetry}>Try again</Button>
                <Button href="/lobby" variant="outline">
                    Back to lobby
                </Button>
            </Centered>
        );
    return (
        <Centered>
            <Spinner />
            <h2 className="font-display text-[22px] font-bold">Analysing your game…</h2>
            <p className="text-[14px] text-ink-muted">Stockfish depth 18 is reviewing every move.</p>
        </Centered>
    );
}
