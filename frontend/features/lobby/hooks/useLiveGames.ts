import { useEffect, useEffectEvent, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { fetchLiveGames } from '@/lib/api/lobby';
import { emitWithAck } from '@/lib/socket/ack';
import type { LiveGame } from '@/types/liveGame';

/** How often the lobby re-reads the live games. */
export const LIVE_GAMES_REFRESH_MS = 15_000;

/** Game id → viewers watching, as the game server counted them (F-130). */
export type WatcherCounts = Readonly<Record<string, number>>;

function countsOf(ack: unknown): WatcherCounts {
    const counts = (ack as { counts?: unknown } | null)?.counts;
    if (!counts || typeof counts !== 'object') return {};
    return Object.fromEntries(Object.entries(counts).filter(([, n]) => typeof n === 'number' && Number.isInteger(n)));
}

/** Each game with its count; a game the server has not counted gets none (nothing is shown). */
export function withWatchers(games: LiveGame[], counts: WatcherCounts): LiveGame[] {
    return games.map((g) => (counts[g.id] === undefined ? g : { ...g, watching: counts[g.id] }));
}

/**
 * Active public games (GET /api/games/live), read on mount and every LIVE_GAMES_REFRESH_MS
 * until unmount, each with how many watch it. The counts live in the game server's Redis, so
 * they are asked for over the lobby's authenticated socket (`spectator_counts`, ADR F-130).
 * A failed refresh keeps the last list; a failed count shows none.
 */
export function useLiveGames(socket: Socket | null): LiveGame[] {
    const [games, setGames] = useState<LiveGame[]>([]);
    const [counts, setCounts] = useState<WatcherCounts>({});

    const askCounts = useEffectEvent((next: LiveGame[]) => {
        if (!socket || next.length === 0) return;
        emitWithAck(
            socket,
            'spectator_counts',
            { game_ids: next.map((g) => g.id) },
            {
                onAccepted: (ack) => setCounts(countsOf(ack)),
                onRejected: () => setCounts({}),
            },
        );
    });

    useEffect(() => {
        let active = true;
        const load = () => {
            fetchLiveGames()
                .then((next) => {
                    if (!active) return;
                    setGames(next);
                    askCounts(next);
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

    // A socket that arrives after the list (first connect, reconnect) asks at once.
    const askForCurrent = useEffectEvent(() => askCounts(games));
    useEffect(() => {
        askForCurrent();
    }, [socket]);

    return withWatchers(games, counts);
}
