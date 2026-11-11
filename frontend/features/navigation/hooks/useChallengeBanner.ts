'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/SocketProvider';
import type { ChallengeRequestPayload, GameIdPayload } from '@/types/socket';
import type { NavProfile } from '../types';

const CHALLENGE_DISMISS_MS = 30_000;

/**
 * Incoming challenge toast via socket (challenge_request / _declined / _ready),
 * auto-dismissed after 30 s, with accept/decline emits.
 */
export function useChallengeBanner(profile: NavProfile | null) {
    const socket = useSocket();
    const router = useRouter();
    const [challengeBanner, setChallengeBanner] = useState<ChallengeRequestPayload | null>(null);
    // The subscription re-runs only on [socket, profile], as before; the router is read through a ref.
    const routerRef = useRef(router);
    useEffect(() => {
        routerRef.current = router;
    });

    useEffect(() => {
        if (!socket || !profile) return;
        let dismissTimer: ReturnType<typeof setTimeout> | null = null;
        const clearTimer = () => {
            if (dismissTimer) clearTimeout(dismissTimer);
        };
        const onChallenge = (data: ChallengeRequestPayload) => {
            setChallengeBanner(data);
            clearTimer();
            dismissTimer = setTimeout(() => setChallengeBanner(null), CHALLENGE_DISMISS_MS);
        };
        const onDeclined = () => {
            setChallengeBanner(null);
            clearTimer();
        };
        const onReady = (data: GameIdPayload) => {
            setChallengeBanner(null);
            clearTimer();
            routerRef.current.push(`/game/${data.game_id}`);
        };
        socket.on('challenge_request', onChallenge);
        socket.on('challenge_declined', onDeclined);
        socket.on('challenge_ready', onReady);
        return () => {
            socket.off('challenge_request', onChallenge);
            socket.off('challenge_declined', onDeclined);
            socket.off('challenge_ready', onReady);
            clearTimer();
        };
    }, [socket, profile]);

    const accept = () => {
        if (!socket || !challengeBanner || !profile) return;
        socket.emit('challenge_accept', {
            from_user_id: challengeBanner.from_user_id,
            to_user_id: profile.id,
            time_control: challengeBanner.time_control,
            is_rated: challengeBanner.is_rated,
            // LEGACY (preserved): the server reads `color` as the challenger's colour, but this inverts it.
            color: challengeBanner.color === 'white' ? 'black' : 'white',
        });
        setChallengeBanner(null);
    };

    const decline = () => {
        if (!socket || !challengeBanner || !profile) return;
        socket.emit('challenge_decline', { from_user_id: challengeBanner.from_user_id, by_username: profile.username });
        setChallengeBanner(null);
    };

    return { challengeBanner, accept, decline };
}
