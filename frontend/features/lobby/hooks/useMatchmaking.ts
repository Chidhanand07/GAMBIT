import { useEffect, useEffectEvent, useState } from 'react';
import type { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { onRejected } from '@/lib/socket/ack';
import type { JoinQueuePayload } from '@/types/socket';
import type { TimeControl } from '@/types/timeControl';
import type { LobbyProfile } from '../types';

const SEARCH_TICK_MS = 1000;
/** The lobby has no casual toggle: Play Online queues rated games (the server's default too). */
const RATED_BY_DEFAULT = true;

/** What the player queued for; the reconnect re-queue re-sends exactly this (F8). */
export interface QueueTerms {
    timeControl: TimeControl;
    increment: number;
    isRated?: boolean;
}

interface MatchmakingOptions {
    socket: Socket | null;
    router: ReturnType<typeof useRouter>;
    profile: LobbyProfile | null;
    /** Called when the server starts a game for this user (e.g. a friend joined the invite). */
    onGameStart: () => void;
    /** Called when the server paired us but could not create the game (we are out of the queue). */
    onMatchFailed?: (reason: string) => void;
    /** Called with the server's code when it refuses a join_queue, first or re-queued (ACKS). */
    onQueueRefused?: (code: string) => void;
}

type MatchFoundPayload = { id?: string; game_id?: string; white_id: string; black_id: string };
type SocketListener = Parameters<Socket['on']>[1];
type QueueEvent = 'match_found' | 'match_failed' | 'game_start' | 'connect';
const QUEUE_EVENTS: readonly QueueEvent[] = ['match_found', 'match_failed', 'game_start', 'connect'];

/** The single join_queue shape (F8). The server ignores `user` and queues the handshake user. */
export function queuePayload(userId: string, terms: QueueTerms): JoinQueuePayload {
    return {
        user: { id: userId },
        time_control: terms.timeControl,
        increment: terms.increment,
        is_rated: terms.isRated ?? RATED_BY_DEFAULT,
    };
}

/** Seconds spent searching; resets to 0 when the search stops. */
function useSearchTimer(searching: boolean): number {
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

    return searchTime;
}

/**
 * Queue state, the search timer and the match_found / match_failed / game_start / connect
 * listeners (registered once per socket; they read the latest state when an event arrives).
 * A reconnect while searching re-sends the queued payload and reads its ack; leaving the
 * lobby while searching leaves the queue.
 */
export function useMatchmaking(options: MatchmakingOptions) {
    const { socket, router, profile } = options;
    const [queued, setQueued] = useState<QueueTerms | null>(null);
    const searching = queued !== null;
    const searchTime = useSearchTimer(searching);

    const sendJoin = (terms: QueueTerms) => {
        if (!socket || !profile) return;
        const refused = onRejected((code) => {
            setQueued(null);
            options.onQueueRefused?.(code);
        });
        socket.emit('join_queue', queuePayload(profile.id, terms), refused);
    };
    const sendLeave = () => socket?.emit('leave_queue', profile?.id);

    const handlers: Record<QueueEvent, SocketListener> = {
        match_found: (data: MatchFoundPayload) => {
            if (!searching) return; // a stale pairing for a search we already left
            setQueued(null);
            router.push(`/game/${data.id ?? data.game_id}`);
        },
        // The pairing fell through on the server: stop "searching" and say so.
        match_failed: (data: { reason: string }) => {
            setQueued(null);
            options.onMatchFailed?.(data.reason);
        },
        game_start: (data: { id: string }) => {
            options.onGameStart();
            router.push(`/game/${data.id}`);
        },
        // Re-queue after a reconnect with exactly what was queued, waiting for the server's ack.
        connect: () => {
            if (queued) sendJoin(queued);
        },
    };
    // The listeners below are registered once per socket and look the handler up when an
    // event fires, so they always see the latest render's state.
    const handle = useEffectEvent((event: QueueEvent, data: unknown) => handlers[event](data));
    const leaveIfSearching = useEffectEvent(() => {
        if (searching) sendLeave();
    });

    useEffect(() => {
        if (!socket) return;
        const registered = QUEUE_EVENTS.map((event) => [event, (data: unknown) => handle(event, data)] as const);
        for (const [event, listener] of registered) socket.on(event, listener);
        return () => {
            for (const [event, listener] of registered) socket.off(event, listener);
            leaveIfSearching();
        };
    }, [socket]);

    const joinQueue = (terms: QueueTerms) => {
        setQueued(terms);
        sendJoin(terms);
    };

    const cancelSearch = () => {
        sendLeave();
        setQueued(null);
    };

    return { searching, searchTime, joinQueue, cancelSearch };
}
