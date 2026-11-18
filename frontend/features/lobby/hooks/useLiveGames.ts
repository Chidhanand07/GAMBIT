import { useEffect, useState } from 'react';
import { fetchLiveGames } from '@/lib/api/lobby';
import type { LiveGame } from '@/types/liveGame';

/** How often the lobby re-reads the live games. */
export const LIVE_GAMES_REFRESH_MS = 15_000;

/**
 * Active public games (GET /api/games/live), read on mount and every LIVE_GAMES_REFRESH_MS
 * until unmount. A failed refresh keeps the last list.
 */
export function useLiveGames(): LiveGame[] {
    const [games, setGames] = useState<LiveGame[]>([]);

    useEffect(() => {
        let active = true;
        const load = () => {
            fetchLiveGames()
                .then((next) => {
                    if (active) setGames(next);
                })
                .catch(() => {});
        };
        load();
        const timer = setInterval(load, LIVE_GAMES_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    return games;
}
