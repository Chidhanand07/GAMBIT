import Link from 'next/link';
import type { ProfileLoadStatus } from '../hooks/useProfileData';

interface ProfileUnavailableProps {
    status: ProfileLoadStatus;
    username: string;
    onRetry: () => void;
}

/** What the profile page shows until a profile is loaded: a spinner, "not found", or an error with Retry. */
export function ProfileUnavailable({ status, username, onRetry }: ProfileUnavailableProps) {
    if (status === 'not-found') {
        return (
            <div className="flex flex-col items-center gap-3 p-20 text-center">
                <h1 className="text-xl font-medium text-text-primary">Player not found</h1>
                <p className="text-sm text-text-tertiary">No player is called @{username}.</p>
                <Link href="/leaderboard" className="text-accent text-sm hover:underline">
                    Browse the leaderboard
                </Link>
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="flex flex-col items-center gap-3 p-20 text-center">
                <p className="text-sm text-text-secondary">Could not load this profile.</p>
                <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-elevated hover:bg-hover border border-border rounded-lg text-sm text-text-primary"
                >
                    Retry
                </button>
            </div>
        );
    }
    return (
        <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-border border-t-accent animate-spin" />
        </div>
    );
}
