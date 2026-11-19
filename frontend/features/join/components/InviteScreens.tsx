import Link from 'next/link';
import { CenteredCard } from '@/components/layout/CenteredCard';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';

export function InviteLoading() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <Spinner label="Loading invite" />
        </div>
    );
}

export function InviteExpired() {
    return (
        <CenteredCard
            title="Invite expired or not found"
            subtitle="This invite link is invalid or has expired (48h limit)."
        >
            <Button href="/lobby" size="xl" className="font-bold">
                Go to Lobby
            </Button>
        </CenteredCard>
    );
}

interface InviteActionsProps {
    error: string | null;
    isCreator: boolean;
    joining: boolean;
    onJoin: () => void;
}

/** Error line, accept button (or creator's waiting note) and the decline link. */
export function InviteActions({ error, isCreator, joining, onJoin }: InviteActionsProps) {
    return (
        <div className="flex flex-col gap-3">
            {error && (
                <p role="alert" className="m-0 text-center text-[14px] font-medium text-danger">
                    {error}
                </p>
            )}
            {isCreator ? (
                <div role="status" className="flex items-center justify-center gap-2 py-3 text-[14px] text-ink-muted">
                    <Spinner size="sm" />
                    Waiting for opponent to join...
                </div>
            ) : (
                <Button size="2xl" className="w-full font-bold disabled:opacity-50" onClick={onJoin} disabled={joining}>
                    {joining ? (
                        <>
                            <Spinner size="sm" className="border-transparent border-t-on-accent" /> Joining...
                        </>
                    ) : (
                        <>
                            <Icon name="users" /> Accept & Play
                        </>
                    )}
                </Button>
            )}
            <Link
                href="/lobby"
                className="flex min-h-[44px] items-center justify-center text-[14px] font-semibold text-ink-muted"
            >
                Decline
            </Link>
        </div>
    );
}
