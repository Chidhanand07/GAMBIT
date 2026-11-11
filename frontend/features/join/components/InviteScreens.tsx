import Link from 'next/link';
import { Loader2, Users } from 'lucide-react';

const SCREEN_CLASS = 'min-h-[calc(100vh-56px)]';

export function InviteLoading() {
    return (
        <div className={`${SCREEN_CLASS} flex items-center justify-center`}>
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    );
}

export function InviteExpired() {
    return (
        <div className={`${SCREEN_CLASS} flex flex-col items-center justify-center gap-4 text-center px-4`}>
            <div className="text-6xl">♟</div>
            <h1 className="text-2xl font-medium text-text-primary">Invite expired or not found</h1>
            <p className="text-text-secondary text-sm">This invite link is invalid or has expired (48h limit).</p>
            <Link
                href="/lobby"
                className="mt-4 px-6 py-3 bg-accent hover:bg-accent-hover text-surface rounded-lg font-medium transition-colors"
            >
                Go to Lobby
            </Link>
        </div>
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
        <div className="px-6 pb-6 space-y-3">
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            {isCreator ? (
                <div className="text-center py-3 text-text-secondary text-sm flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                    Waiting for opponent to join...
                </div>
            ) : (
                <button
                    onClick={onJoin}
                    disabled={joining}
                    className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                    {joining ? (
                        <>
                            <Loader2 size={18} className="animate-spin" /> Joining...
                        </>
                    ) : (
                        <>
                            <Users size={18} strokeWidth={1.5} /> Accept & Play
                        </>
                    )}
                </button>
            )}
            <Link
                href="/lobby"
                className="block text-center text-text-tertiary text-sm hover:text-text-secondary transition-colors py-1"
            >
                Decline
            </Link>
        </div>
    );
}
