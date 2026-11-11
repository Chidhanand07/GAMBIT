import { useEffect, useState } from 'react';
import { fetchProfileGamesPage } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';
import type { ProfileGameRow } from '@/types/profilePage';
import type { ProfileTab } from '../types';

export const GAMES_PAGE_SIZE = 15;

interface GameHistoryArgs {
    username: string;
    activeTab: ProfileTab;
    profile: Profile | null;
}

/**
 * Paginated games list for the Games tab. The first page loads when the tab is
 * shown while the list is empty; `loadMore` fetches the next 15 by offset.
 */
export function useGameHistory({ username, activeTab, profile }: GameHistoryArgs) {
    const [games, setGames] = useState<ProfileGameRow[]>([]);
    const [gamesLoading, setGamesLoading] = useState(false);
    const [gamesOffset, setGamesOffset] = useState(0);
    const [hasMoreGames, setHasMoreGames] = useState(true);

    // Re-runs only on tab or profile-id change (legacy dependency list, kept on purpose).
    useEffect(() => {
        if (activeTab === 'games' && games.length === 0 && profile) {
            void loadGames(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: legacy deps [activeTab, profile?.id]
    }, [activeTab, profile?.id]);

    const loadGames = async (offset: number) => {
        if (!profile) return;
        setGamesLoading(true);
        try {
            const res = await fetchProfileGamesPage(username, GAMES_PAGE_SIZE, offset);
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
    };

    const loadMore = () => loadGames(gamesOffset);

    return { games, gamesLoading, hasMoreGames, loadMore };
}
