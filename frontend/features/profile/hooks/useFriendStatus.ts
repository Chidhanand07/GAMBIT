import { useEffect, useState } from 'react';
import { fetchFriendStatus, sendFriendRequest } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';
import type { FriendStatus } from '../types';

interface FriendStatusArgs {
    username: string;
    profile: Profile | null;
    meProfile: Profile | null;
    isOwnProfile: boolean;
}

/** Friend-request state of the viewer towards a profile they do not own, plus the "Add Friend" action. */
export function useFriendStatus({ username, profile, meProfile, isOwnProfile }: FriendStatusArgs) {
    const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');

    const profileId = profile?.id;
    const meId = meProfile?.id;
    // The status is asked for the loaded profile's own username, so it re-runs only when a
    // different profile (or viewer) has loaded, not while the next one is still loading.
    const profileUsername = profile?.username;

    useEffect(() => {
        if (!profileId || !meId || isOwnProfile || !profileUsername) {
            setFriendStatus('none');
            return;
        }
        fetchFriendStatus(profileUsername)
            .then((r) => (r.ok ? r.json() : { status: 'none' as const }))
            .then((d) => setFriendStatus(d.status ?? 'none'))
            .catch(() => setFriendStatus('none'));
    }, [profileId, meId, isOwnProfile, profileUsername]);

    const addFriend = async () => {
        if (!meProfile) return;
        setFriendStatus('pending_sent');
        try {
            const res = await sendFriendRequest(username);
            if (!res.ok) setFriendStatus('none');
        } catch {
            setFriendStatus('none');
        }
    };

    return { friendStatus, addFriend };
}
