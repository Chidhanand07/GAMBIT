import Link from 'next/link';
import { Swords } from 'lucide-react';
import type { Friend } from '@/types/friendship';
import { AvatarImg } from './AvatarImg';
import { challengeHref, profileHref } from '../links';

/** The friend avatar box is w-10. */
const FRIEND_AVATAR_PX = 40;

const DEFAULT_RATING = 1200;

/** Case-insensitive match on username or display name; an empty query keeps everyone. */
export function matchesFriendSearch(friend: Pick<Friend, 'username' | 'display_name'>, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return (friend.username ?? '').toLowerCase().includes(q) || (friend.display_name ?? '').toLowerCase().includes(q);
}

function FriendRow({ friend: f, canChallenge }: { friend: Friend; canChallenge: boolean }) {
    return (
        <div className="flex items-center justify-between px-5 py-3 hover:bg-hover transition-colors">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-elevated border border-border-strong flex items-center justify-center overflow-hidden shrink-0">
                    {f.avatar_url ? (
                        <AvatarImg src={f.avatar_url} size={FRIEND_AVATAR_PX} />
                    ) : (
                        <span className="text-accent font-medium">{(f.username ?? '?')[0].toUpperCase()}</span>
                    )}
                </div>
                <div>
                    <Link
                        href={profileHref(f.username)}
                        className="text-text-primary text-sm font-medium hover:text-accent transition-colors block"
                    >
                        {f.display_name || f.username}
                    </Link>
                    <div className="text-text-tertiary text-xs">
                        {Math.round(f.rating_rapid ?? DEFAULT_RATING)} Rapid
                    </div>
                </div>
            </div>
            {canChallenge && (
                <Link
                    href={challengeHref(f.username)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-surface text-xs font-medium rounded-lg transition-colors"
                >
                    <Swords size={12} strokeWidth={1.5} /> Challenge
                </Link>
            )}
        </div>
    );
}

interface FriendsListCardProps {
    title: string;
    friends: Friend[];
    friendsLoading: boolean;
    friendSearch: string;
    onSearchChange: (value: string) => void;
    isOwnProfile: boolean;
}

function FriendsListBody({
    friends,
    friendsLoading,
    friendSearch,
    isOwnProfile,
}: Omit<FriendsListCardProps, 'title' | 'onSearchChange'>) {
    if (friendsLoading)
        return (
            <div className="py-10 flex justify-center">
                <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
        );
    if (friends.length === 0) return <p className="text-text-tertiary text-sm text-center py-10">No friends yet.</p>;
    return (
        <div className="divide-y divide-border/50">
            {friends
                .filter((f) => matchesFriendSearch(f, friendSearch))
                .map((f) => (
                    <FriendRow key={f.friendship_id ?? f.username} friend={f} canChallenge={isOwnProfile} />
                ))}
        </div>
    );
}

/** Friends list with a count, a search box (when non-empty) and per-friend Challenge links on your own profile. */
export function FriendsListCard(props: FriendsListCardProps) {
    const { title, friends, friendSearch, onSearchChange } = props;
    return (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-elevated gap-3">
                <h3 className="text-sm font-medium text-text-primary shrink-0">
                    {title}
                    {friends.length > 0 && <span className="ml-2 text-xs text-text-tertiary">({friends.length})</span>}
                </h3>
                {friends.length > 0 && (
                    <input
                        type="text"
                        placeholder="Search friends…"
                        value={friendSearch}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="flex-1 max-w-[200px] h-8 bg-page border border-border rounded-lg px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                    />
                )}
            </div>
            <FriendsListBody {...props} />
        </div>
    );
}
