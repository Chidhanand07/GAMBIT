import { useEffect, useState } from 'react';
import {
    fetchFriendsOf,
    fetchPendingFriendRequests,
    respondToFriendRequest,
    type TypedResponse,
} from '@/lib/api/profile';
import type { Friend, PendingFriendRequest } from '@/types/friendship';
import type { Profile } from '@/types/profile';
import type { ProfileTab } from '../types';

interface FriendsArgs {
    activeTab: ProfileTab;
    profile: Profile | null;
    isOwnProfile: boolean;
}

export type FriendRequestAction = 'accept' | 'decline';

/** Loads one list with its loading flag; a failed request (status or network) is an empty list. */
async function loadList<T>(
    request: () => Promise<TypedResponse<T[]>>,
    setList: (list: T[]) => void,
    setLoading: (loading: boolean) => void,
): Promise<void> {
    setLoading(true);
    try {
        const res = await request();
        setList(res.ok ? await res.json() : []);
    } catch {
        setList([]);
    } finally {
        setLoading(false);
    }
}

/**
 * Friends data for the Overview card and the Friends tab: the profile's friends and, on the
 * viewer's own profile, incoming requests with accept/decline.
 * The search text lives here so it survives tab switches.
 */
export function useFriends({ activeTab, profile, isOwnProfile }: FriendsArgs) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [friendSearch, setFriendSearch] = useState('');
    const [respondError, setRespondError] = useState<string | null>(null);

    const profileId = profile?.id;

    const listShown = activeTab === 'friends' || activeTab === 'overview';
    const pendingShown = activeTab === 'friends' && isOwnProfile;

    // Keyed on the profile id rather than the profile object, so a refetch does not reload.
    // Friends load on each visit to the Overview (its Friends card) and to the Friends tab;
    // incoming requests on each visit to your own Friends tab, after the friends list.
    useEffect(() => {
        if (!listShown || !profileId) return;
        const loadFriends = async () => {
            // Pass userId so public profiles can also show friends
            await loadList(() => fetchFriendsOf(profileId), setFriends, setFriendsLoading);
            if (pendingShown) await loadList(fetchPendingFriendRequests, setPendingRequests, setPendingLoading);
        };
        void loadFriends();
    }, [listShown, pendingShown, profileId]);

    const respondToRequest = async (friendshipId: string, action: FriendRequestAction) => {
        setRespondError(null);
        const ok = await respondToFriendRequest(friendshipId, action).then(
            (res) => res.ok,
            () => false,
        );
        if (!ok) {
            // The request is still pending on the server: keep it on screen so it can be retried (F12).
            setRespondError(`Could not ${action} the request. Try again.`);
            return;
        }
        setPendingRequests((prev) => prev.filter((r) => r.id !== friendshipId));
        if (action === 'accept') {
            const requester = pendingRequests.find((r) => r.id === friendshipId)?.requester;
            if (requester) setFriends((prev) => [...prev, { ...requester, friendship_id: friendshipId }]);
        }
    };

    return {
        friends,
        friendsLoading,
        pendingRequests,
        pendingLoading,
        friendSearch,
        setFriendSearch,
        respondToRequest,
        respondError,
    };
}
