import { useEffect, useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { formatTimeControl } from '@/lib/chess/timeControl';
import type { JoinQueuePayload } from '@/types/socket';
import type { LobbyProfile, TcMinutes } from '../types';

const SEARCH_TICK_MS = 1000;

interface MatchmakingOptions {
    socket: Socket | null;
    router: ReturnType<typeof useRouter>;
    profile: LobbyProfile | null;
    getTcMinutes: () => TcMinutes;
    /** Called when the server starts a game for this user (e.g. a friend joined the invite). */
    onGameStart: () => void;
}

/**
 * Queue state, the search timer and the match_found / game_start / connect
 * listeners. Unmounting removes the listeners but does NOT emit leave_queue.
 */
export function useMatchmaking({ socket, router, profile, getTcMinutes, onGameStart }: MatchmakingOptions) {
    const [searching, setSearching] = useState(false);
    const [searchTime, setSearchTime] = useState(0);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (searching) {
            interval = setInterval(() => setSearchTime((t) => t + 1), SEARCH_TICK_MS);
        } else {
            setSearchTime(0);
        }
        return () => clearInterval(interval);
    }, [searching]);

    useEffect(() => {
        if (!socket) return;

        const onMatchFound = (data: { id?: string; game_id?: string; white_id: string; black_id: string }) => {
            setSearching(false);
            router.push(`/game/${data.id ?? data.game_id}`);
        };

        const onGameStarted = (data: { id: string }) => {
            onGameStart();
            router.push(`/game/${data.id}`);
        };

        // Re-queue after a reconnect, for the same time control (base and increment) as before.
        const onConnect = () => {
            if (!profile || !searching) return;
            const { mins, inc } = getTcMinutes();
            socket.emit('join_queue', {
                user: { id: profile.id },
                time_control: formatTimeControl({ minutes: mins, incrementSeconds: inc }),
                increment: inc,
                is_rated: true,
            });
        };

        socket.on('match_found', onMatchFound);
        socket.on('game_start', onGameStarted);
        socket.on('connect', onConnect);

        return () => {
            socket.off('match_found', onMatchFound);
            socket.off('game_start', onGameStarted);
            socket.off('connect', onConnect);
        };
    }, [socket, router, profile, searching, getTcMinutes, onGameStart]);

    const joinQueue = (payload: JoinQueuePayload) => {
        socket?.emit('join_queue', payload);
        setSearching(true);
    };

    const cancelSearch = () => {
        socket?.emit('leave_queue', profile?.id);
        setSearching(false);
    };

    return { searching, searchTime, joinQueue, cancelSearch };
}
