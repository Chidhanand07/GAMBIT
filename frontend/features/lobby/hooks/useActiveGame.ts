import { useEffect, useState } from 'react';
import { fetchActiveGame } from '@/lib/api/lobby';
import type { ActiveGame } from '@/types/lobby';

/** Fetches GET /api/games/active once on mount; any failure or a body without `id` means none. */
export function useActiveGame(): ActiveGame | null {
    const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);

    useEffect(() => {
        fetchActiveGame()
            .then((game) => {
                if (game?.id) setActiveGame(game);
            })
            .catch(() => {});
    }, []);

    return activeGame;
}
