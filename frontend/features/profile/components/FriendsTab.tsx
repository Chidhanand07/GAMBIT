import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/design/cn';
import type { Friend, PendingFriendRequest } from '@/types/friendship';
import type { ProfileSummary } from '@/types/profile';
import type { FriendRequestAction } from '../hooks/useFriends';
import { challengeHref, profileHref } from '../links';
import { matchesFriendSearch } from '../model';
import { EMPTY, LIST_CARD, LIST_TITLE, PANEL } from './styles';

const ROW = 'flex items-center gap-[14px] border-t-1 border-line-subtle px-6 py-3';

/** Initial avatar, name link and rapid rating of a player in a friends list. */
function Person({ player }: { player: ProfileSummary }) {
    const name = player.display_name || player.username;
    return (
        <>
            <span
                aria-hidden="true"
                className="box-content flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-1.5 border-line bg-bg-base font-display font-bold text-accent"
            >
                {name.charAt(0).toUpperCase()}
            </span>
            <span className="flex flex-1 flex-col">
                <Link href={profileHref(player.username)} className="font-semibold no-underline">
                    {name}
                </Link>
                {player.rating_rapid != null && (
                    <span className="font-mono text-[13px] text-ink-muted">
                        {Math.round(player.rating_rapid)} rapid
                    </span>
                )}
            </span>
        </>
    );
}

interface PendingProps {
    requests: PendingFriendRequest[];
    loading: boolean;
    error: string | null;
    onRespond: (id: string, action: FriendRequestAction) => void;
}

function PendingRequests({ requests, loading, error, onRespond }: PendingProps) {
    return (
        <Card className={cn(PANEL, 'gap-2')}>
            <h2 className={LIST_TITLE}>Pending requests</h2>
            {error && (
                <span role="alert" className="text-[14px] text-danger">
                    {error}
                </span>
            )}
            {loading && <span className="py-3 text-center text-ink-muted">Loading…</span>}
            {!loading && requests.length === 0 && (
                <span className="py-3 text-center text-ink-muted">No pending requests.</span>
            )}
            {requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-[14px] py-2">
                    {r.requester && <Person player={r.requester} />}
                    <Button size="sm" onClick={() => onRespond(r.id, 'accept')}>
                        Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onRespond(r.id, 'decline')}>
                        Decline
                    </Button>
                </div>
            ))}
        </Card>
    );
}

interface FriendsListProps {
    title: string;
    friends: Friend[];
    loading: boolean;
    search: string;
    onSearch: (q: string) => void;
    canChallenge: boolean;
}

function FriendsList({ title, friends, loading, search, onSearch, canChallenge }: FriendsListProps) {
    const shown = friends.filter((f) => matchesFriendSearch(f, search));
    return (
        <Card className={LIST_CARD}>
            <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                <h2 className={LIST_TITLE}>
                    {title} <span className="text-[15px] font-medium text-ink-muted">({friends.length})</span>
                </h2>
                <label className="block flex-[1_1_240px]">
                    <span className="sr-only">Search friends</span>
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Search friends…"
                        className="box-border min-h-[44px] w-full rounded-pill border-1 border-ink-disabled bg-bg-base px-4 text-[15px] text-ink placeholder:text-ink-placeholder"
                    />
                </label>
            </div>
            {loading && <div className={EMPTY}>Loading friends…</div>}
            {!loading && friends.length === 0 && <div className={EMPTY}>No friends yet.</div>}
            {shown.map((f) => (
                <div key={f.friendship_id ?? f.username} className={ROW}>
                    <Person player={f} />
                    {canChallenge && (
                        <Button href={challengeHref(f.username)} size="md" className="px-[18px] text-[14px] font-bold">
                            Challenge
                        </Button>
                    )}
                </div>
            ))}
        </Card>
    );
}

export interface FriendsTabProps {
    isOwnProfile: boolean;
    /** Display name of the viewed profile, for "<Name>'s friends". */
    ownerName: string;
    friends: Friend[];
    friendsLoading: boolean;
    pendingRequests: PendingFriendRequest[];
    pendingLoading: boolean;
    respondError: string | null;
    onRespond: (id: string, action: FriendRequestAction) => void;
    search: string;
    onSearch: (q: string) => void;
}

/** Your own profile: incoming requests and your friends with Challenge; another profile: their friends. */
export function FriendsTab(props: FriendsTabProps) {
    return (
        <>
            {props.isOwnProfile && (
                <PendingRequests
                    requests={props.pendingRequests}
                    loading={props.pendingLoading}
                    error={props.respondError}
                    onRespond={props.onRespond}
                />
            )}
            <FriendsList
                title={props.isOwnProfile ? 'My friends' : `${props.ownerName}'s friends`}
                friends={props.friends}
                loading={props.friendsLoading}
                search={props.search}
                onSearch={props.onSearch}
                canChallenge={props.isOwnProfile}
            />
        </>
    );
}
