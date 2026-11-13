'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/SocketProvider';
import { useToast } from '@/components/Toast';
import { emitWithAck, rejectionMessage } from '@/lib/socket/ack';
import type { ChallengeRequestPayload, GameIdPayload } from '@/types/socket';
import type { NavProfile } from '../types';

const CHALLENGE_DISMISS_MS = 30_000;

/**
 * Incoming challenge toast via socket (challenge_request / _declined / _ready),
 * auto-dismissed after 30 s, with accept/decline emits. Both wait for the server's ack; a
 * refusal (the challenge expired) or no answer is shown as an error toast (ACKS, F-065).
 */
export function useChallengeBanner(profile: NavProfile | null) {
    const socket = useSocket();
    const router = useRouter();
    const { toast } = useToast();
    const toldWhenRefused = { onRejected: (code: string) => toast(rejectionMessage(code), 'error') };
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
        // Only the challenger is named: the server starts the game from the challenge it stored
        // (time control, rated flag and the challenger's colour), not from anything sent here.
        emitWithAck(socket, 'challenge_accept', { from_user_id: challengeBanner.from_user_id }, toldWhenRefused);
        setChallengeBanner(null);
    };

    const decline = () => {
        if (!socket || !challengeBanner || !profile) return;
        const answer = { from_user_id: challengeBanner.from_user_id, by_username: profile.username };
        emitWithAck(socket, 'challenge_decline', answer, toldWhenRefused);
        setChallengeBanner(null);
    };

    return { challengeBanner, accept, decline };
}
