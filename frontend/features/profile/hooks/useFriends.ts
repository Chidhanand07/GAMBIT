import { useEffect, useState } from 'react';
import { fetchFriendsOf, fetchPendingFriendRequests, respondToFriendRequest } from '@/lib/api/profile';
import type { Friend, PendingFriendRequest } from '@/types/friendship';
import type { Profile } from '@/types/profile';
import type { ProfileTab } from '../types';

interface FriendsArgs {
    activeTab: ProfileTab;
    profile: Profile | null;
    isOwnProfile: boolean;
}

export type FriendRequestAction = 'accept' | 'decline';

/**
 * Friends tab data: the profile's friends (loaded on every visit to the tab)
 * and, on the viewer's own profile, incoming requests with accept/decline.
 * The search text lives here so it survives tab switches.
 */
export function useFriends({ activeTab, profile, isOwnProfile }: FriendsArgs) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [friendSearch, setFriendSearch] = useState('');
    const [respondError, setRespondError] = useState<string | null>(null);

    // Keyed on profile?.id rather than the profile object (legacy dependency list, kept on purpose).
    useEffect(() => {
        if (activeTab !== 'friends' || !profile) return;
        const loadFriends = async () => {
            setFriendsLoading(true);
            try {
                // Pass userId so public profiles can also show friends
                const res = await fetchFriendsOf(profile.id);
                setFriends(res.ok ? await res.json() : []);
            } catch {
                setFriends([]);
            } finally {
                setFriendsLoading(false);
            }

            if (isOwnProfile) {
                setPendingLoading(true);
                try {
                    const res = await fetchPendingFriendRequests();
                    setPendingRequests(res.ok ? await res.json() : []);
                } catch {
                    setPendingRequests([]);
                } finally {
                    setPendingLoading(false);
                }
            }
        };
        void loadFriends();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: legacy deps [activeTab, profile?.id, isOwnProfile]
    }, [activeTab, profile?.id, isOwnProfile]);

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
