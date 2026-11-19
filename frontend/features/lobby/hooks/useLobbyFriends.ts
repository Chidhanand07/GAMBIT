import { useEffect, useState } from 'react';
import { usePresence } from '@/components/PresenceProvider';
import { fetchMyFriends } from '@/lib/api/lobby';
import { presenceStatusOf, type PresenceSets, type PresenceStatus } from '@/lib/presence/presenceStatus';
import type { Friend } from '@/types/friendship';
import type { SpeedBucket } from '@/types/timeControl';
import { DEFAULT_RATING } from '../constants';
import type { LobbyFriend } from '../types';

/** List order: online, then away, then offline. */
const STATUS_ORDER: Readonly<Record<PresenceStatus, number>> = { online: 0, away: 1, offline: 2 };

/**
 * Friends with their presence and their rating in `pool`: online first, then away, then offline,
 * each by name.
 */
export function toLobbyFriends(friends: Friend[], presence: PresenceSets, pool: SpeedBucket = 'rapid'): LobbyFriend[] {
    return friends
        .map((f) => ({
            username: f.username,
            display_name: f.display_name ?? null,
            avatar_url: f.avatar_url ?? null,
            rating: Math.round(f[`rating_${pool}`] ?? DEFAULT_RATING),
            status: presenceStatusOf(f.id, presence),
        }))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.username.localeCompare(b.username));
}

/**
 * My friends (GET /api/friends) with their rating in the selected time control's pool, read the first time `enabled` is true; presence comes live from
 * PresenceProvider. Null until loaded; a failed read is an empty list.
 */
export function useLobbyFriends(enabled: boolean, pool: SpeedBucket): LobbyFriend[] | null {
    const { onlineUserIds, awayUserIds } = usePresence();
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

    return friends && toLobbyFriends(friends, { present: onlineUserIds, away: awayUserIds }, pool);
}
