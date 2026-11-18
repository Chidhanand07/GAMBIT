import { useEffect, useState } from 'react';
import { fetchRecentGames } from '@/lib/api/profile';
import type { ProfileGameRow } from '@/types/profilePage';
import type { ProfileTab } from '../types';

/**
 * The Overview's five most recent games, fetched each time the Overview is shown for a loaded
 * profile (and when `username` changes). A failed request (status or network) is an empty list.
 */
export function useRecentGames(username: string, activeTab: ProfileTab, profileId: string | undefined) {
    const [games, setGames] = useState<ProfileGameRow[]>([]);
    const [loading, setLoading] = useState(true);
    const visible = activeTab === 'overview' && profileId !== undefined;

    useEffect(() => {
        if (!visible) return;
        let current = true;
        fetchRecentGames(username)
            .then((r) => (r.ok ? r.json() : { games: [] }))
            .then((d) => {
                if (current) setGames(d.games ?? []);
            })
            .catch(() => {})
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [username, visible]);

    return { games, loading };
}
