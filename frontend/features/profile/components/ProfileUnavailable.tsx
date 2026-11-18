import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ProfileLoadStatus } from '../hooks/useProfileData';

interface ProfileUnavailableProps {
    status: ProfileLoadStatus;
    username: string;
    onRetry: () => void;
}

const SHELL = 'mx-auto box-border flex max-w-[1040px] flex-col px-8 pb-[72px] pt-9';

/** What the profile page shows until a profile is loaded: loading, "not found", or an error with Retry. */
export function ProfileUnavailable({ status, username, onRetry }: ProfileUnavailableProps) {
    if (status === 'loading') {
        return (
            <div className={SHELL}>
                <div role="status" className="p-20 text-center text-ink-muted">
                    Loading profile…
                </div>
            </div>
        );
    }
    const notFound = status === 'not-found';
    return (
        <div className={SHELL}>
            <Card className="flex flex-col items-center gap-3 p-7 text-center">
                {notFound ? (
                    <>
                        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.03em]">Player not found</h1>
                        <p className="m-0 text-ink-muted">No player is called @{username}.</p>
                        <Button href="/leaderboard" variant="ghost">
                            Browse the leaderboard
                        </Button>
                    </>
                ) : (
                    <>
                        <p className="m-0 text-ink-muted">Could not load this profile.</p>
                        <Button variant="outline" onClick={onRetry}>
                            Retry
                        </Button>
                    </>
                )}
            </Card>
        </div>
    );
}
