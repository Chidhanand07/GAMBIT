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

    // Re-runs only when either profile id changes (legacy dependency list, kept on purpose).
    useEffect(() => {
        if (!profile || !meProfile || isOwnProfile) {
            setFriendStatus('none');
            return;
        }
        fetchFriendStatus(username)
            .then((r) => (r.ok ? r.json() : { status: 'none' as const }))
            .then((d) => setFriendStatus(d.status ?? 'none'))
            .catch(() => setFriendStatus('none'));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: legacy deps [profile?.id, meProfile?.id]
    }, [profile?.id, meProfile?.id]);

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
