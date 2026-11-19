import { useEffect, useState } from 'react';
import { usePresence } from '@/components/PresenceProvider';
import { fetchMyFriends } from '@/lib/api/lobby';
import type { Friend } from '@/types/friendship';
import { DEFAULT_RATING } from '../constants';
import type { LobbyFriend } from '../types';

/** Friends with their presence: online first, then by name. */
export function toLobbyFriends(friends: Friend[], onlineIds: ReadonlySet<string>): LobbyFriend[] {
    return friends
        .map((f) => ({
            username: f.username,
            display_name: f.display_name ?? null,
            avatar_url: f.avatar_url ?? null,
            rating: Math.round(f.rating_rapid ?? DEFAULT_RATING),
            online: Boolean(f.id && onlineIds.has(f.id)),
        }))
        .sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
}

/**
 * My friends (GET /api/friends), read the first time `enabled` is true; presence comes live from
 * PresenceProvider. Null until loaded; a failed read is an empty list.
 */
export function useLobbyFriends(enabled: boolean): LobbyFriend[] | null {
    const { onlineUserIds } = usePresence();
    const [friends, setFriends] = useState<Friend[] | null>(null);
    const [requested, setRequested] = useState(false);

    if (enabled && !requested) setRequested(true);

    useEffect(() => {
        if (!requested) return;
        let active = true;
        void fetchMyFriends()
            .catch(() => [])
            .then((list) => {
                if (active) setFriends(list);
            });
        return () => {
            active = false;
        };
    }, [requested]);

    return friends && toLobbyFriends(friends, onlineUserIds);
}
