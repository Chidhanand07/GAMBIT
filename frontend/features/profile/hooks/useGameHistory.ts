import { useCallback, useEffect, useState } from 'react';
import { fetchProfileGamesPage } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';
import type { ProfileGameRow } from '@/types/profilePage';
import type { ProfileTab } from '../types';

export const GAMES_PAGE_SIZE = 15;

interface GameHistoryArgs {
    activeTab: ProfileTab;
    profile: Profile | null;
}

/**
 * Paginated games list for the Games tab. The first page loads when the tab is
 * shown while the list is empty; `loadMore` fetches the next 15 by offset.
 */
export function useGameHistory({ activeTab, profile }: GameHistoryArgs) {
    const [games, setGames] = useState<ProfileGameRow[]>([]);
    const [gamesLoading, setGamesLoading] = useState(false);
    const [gamesOffset, setGamesOffset] = useState(0);
    const [hasMoreGames, setHasMoreGames] = useState(true);

    const profileId = profile?.id;
    // The loaded profile's own username, so nothing is fetched while the next profile is loading.
    const profileUsername = profile?.username;
    const isEmpty = games.length === 0;

    const loadGames = useCallback(
        async (offset: number) => {
            if (!profileId || !profileUsername) return;
            setGamesLoading(true);
            try {
                const res = await fetchProfileGamesPage(profileUsername, GAMES_PAGE_SIZE, offset);
                if (!res.ok) return;
                const data = await res.json();
                const newGames: ProfileGameRow[] = data.games ?? [];
                setGames((prev) => (offset === 0 ? newGames : [...prev, ...newGames]));
                setGamesOffset(offset + newGames.length);
                setHasMoreGames(newGames.length === GAMES_PAGE_SIZE);
            } catch {
                /* silently fail */
            } finally {
                setGamesLoading(false);
            }
        },
        [profileId, profileUsername],
    );

    // The first page loads when the tab is shown with an empty list (again on each visit while empty).
    useEffect(() => {
        if (activeTab === 'games' && isEmpty) void loadGames(0);
    }, [activeTab, isEmpty, loadGames]);

    const loadMore = () => loadGames(gamesOffset);

    return { games, gamesLoading, hasMoreGames, loadMore };
}
