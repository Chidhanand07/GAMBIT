import Link from 'next/link';
import { Clock, Settings, Swords, UserPlus, Users } from 'lucide-react';
import type { FriendStatus } from '../types';

interface FriendButtonProps {
    friendStatus: FriendStatus;
    onAddFriend: () => void;
}

function FriendButton({ friendStatus, onAddFriend }: FriendButtonProps) {
    if (friendStatus === 'loading') return null;
    if (friendStatus === 'friends') {
        return (
            <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm text-indicator-green cursor-default"
            >
                <Users size={15} strokeWidth={1.5} /> Friends
            </button>
        );
    }
    if (friendStatus === 'pending_sent') {
        return (
            <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-tertiary cursor-default"
            >
                <Clock size={15} strokeWidth={1.5} /> Request Sent
            </button>
        );
    }
    return (
        <button
            onClick={onAddFriend}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-hover border border-border rounded-lg text-sm transition-colors"
        >
            <UserPlus size={15} strokeWidth={1.5} /> Add Friend
        </button>
    );
}

interface ProfileActionsProps extends FriendButtonProps {
    username: string;
    isOwnProfile: boolean;
}

/** Header buttons: "Edit Profile" (→ /settings) on your own profile, otherwise friend status + Challenge. */
export function ProfileActions({ username, isOwnProfile, friendStatus, onAddFriend }: ProfileActionsProps) {
    return (
        <div className="flex gap-2 flex-wrap md:flex-nowrap md:self-start mt-2 md:mt-0 shrink-0">
            {isOwnProfile ? (
                <Link
                    href="/settings"
                    className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-hover border border-border rounded-lg text-sm transition-colors"
                >
                    <Settings size={15} strokeWidth={1.5} /> Edit Profile
                </Link>
            ) : (
                <>
                    <FriendButton friendStatus={friendStatus} onAddFriend={onAddFriend} />
                    <Link
                        href={`/challenge/${username}`}
                        className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-surface rounded-lg text-sm transition-colors font-medium"
                    >
                        <Swords size={15} strokeWidth={1.5} /> Challenge
                    </Link>
                </>
            )}
        </div>
    );
}
