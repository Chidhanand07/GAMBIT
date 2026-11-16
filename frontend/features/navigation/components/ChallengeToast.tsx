import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { displayTimeControl } from '@/lib/chess/timeControl';
import type { ChallengeRequestPayload } from '@/types/socket';

interface ChallengeToastProps {
    challenge: Pick<ChallengeRequestPayload, 'from_username' | 'time_control' | 'is_rated'>;
    onAccept: () => void;
    onDecline: () => void;
}

/**
 * Incoming challenge, top right under the header. The mockups have no toast, so it borrows the
 * header popover's surface (surface-header, line border, 20px radius, popover shadow).
 */
export function ChallengeToast({ challenge, onAccept, onDecline }: ChallengeToastProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed right-4 top-[96px] z-[300] box-border flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-20 border-1 border-line bg-surface-header p-4 text-ink shadow-popover"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                    <span className="font-semibold">
                        <span className="text-accent">{challenge.from_username}</span> challenges you
                    </span>
                    <span className="text-[13px] text-ink-muted">
                        {displayTimeControl(challenge.time_control)} · {challenge.is_rated ? 'Rated' : 'Casual'}
                    </span>
                </div>
                <button
                    type="button"
                    aria-label="Dismiss challenge"
                    onClick={onDecline}
                    className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-ink-muted"
                >
                    <Icon name="close" />
                </button>
            </div>
            <div className="flex gap-2">
                <Button size="md" className="flex-1" onClick={onAccept}>
                    Accept
                </Button>
                <Button variant="outline" size="md" className="flex-1" onClick={onDecline}>
                    Decline
                </Button>
            </div>
        </div>
    );
}
