import Link from 'next/link';
import type { PendingFriendRequest } from '@/types/friendship';
import type { FriendRequestAction } from '../hooks/useFriends';
import { AvatarImg } from './AvatarImg';

const DEFAULT_RATING = 1200;

type RespondFn = (friendshipId: string, action: FriendRequestAction) => void;

function RequesterAvatar({ requester }: { requester: PendingFriendRequest['requester'] }) {
    return (
        <div className="w-9 h-9 rounded-full bg-elevated border border-border-strong flex items-center justify-center overflow-hidden shrink-0">
            {requester?.avatar_url ? (
                <AvatarImg src={requester.avatar_url} />
            ) : (
                <span className="text-accent text-sm font-medium">{(requester?.username ?? '?')[0].toUpperCase()}</span>
            )}
        </div>
    );
}

function PendingRow({ req, onRespond }: { req: PendingFriendRequest; onRespond: RespondFn }) {
    const requester = req.requester;
    return (
        <div className="flex items-center justify-between px-5 py-3 hover:bg-hover transition-colors">
            <div className="flex items-center gap-3">
                <RequesterAvatar requester={requester} />
                <div>
                    <Link
                        href={`/profile/${requester?.username}`}
                        className="text-text-primary text-sm font-medium hover:text-accent transition-colors"
                    >
                        {requester?.display_name || requester?.username}
                    </Link>
                    <div className="text-text-tertiary text-xs">
                        {Math.round(requester?.rating_rapid ?? DEFAULT_RATING)} Rapid
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                <button
                    onClick={() => onRespond(req.id, 'accept')}
                    className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-surface text-xs rounded-lg font-medium transition-colors"
                >
                    Accept
                </button>
                <button
                    onClick={() => onRespond(req.id, 'decline')}
                    className="px-3 py-1.5 bg-surface hover:bg-hover border border-border text-text-secondary text-xs rounded-lg transition-colors"
                >
                    Decline
                </button>
            </div>
        </div>
    );
}

interface PendingRequestsCardProps {
    pendingRequests: PendingFriendRequest[];
    pendingLoading: boolean;
    onRespond: RespondFn;
}

/** Incoming friend requests (own profile only) with Accept / Decline. */
export function PendingRequestsCard({ pendingRequests, pendingLoading, onRespond }: PendingRequestsCardProps) {
    return (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-elevated">
                <h3 className="text-sm font-medium text-text-primary">
                    Pending Requests
                    {pendingRequests.length > 0 && (
                        <span className="ml-2 text-xs bg-accent text-surface px-1.5 py-0.5 rounded-full">
                            {pendingRequests.length}
                        </span>
                    )}
                </h3>
            </div>
            {pendingLoading ? (
                <div className="py-8 flex justify-center">
                    <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
            ) : pendingRequests.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-6">No pending requests.</p>
            ) : (
                <div className="divide-y divide-border/50">
                    {pendingRequests.map((req) => (
                        <PendingRow key={req.id} req={req} onRespond={onRespond} />
                    ))}
                </div>
            )}
        </div>
    );
}
