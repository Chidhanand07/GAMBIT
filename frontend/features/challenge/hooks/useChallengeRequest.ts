'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/SocketProvider';
import { useToast } from '@/components/Toast';
import { emitWithAck, rejectionMessage } from '@/lib/socket/ack';
import type { ChallengeRequestPayload, GameIdPayload } from '@/types/socket';

/** What the challenger sends; the server adds the verified sender (NODE-10). */
export type OutgoingChallenge = Omit<ChallengeRequestPayload, 'from_user_id'>;

export interface ChallengeRequestState {
    /** The request is on its way: waiting for the server's ack (the button shows a spinner). */
    sending: boolean;
    /** The server stored and relayed it: waiting for the opponent. */
    sent: boolean;
    declined: boolean;
    send: (challenge: OutgoingChallenge) => void;
}

/**
 * Sending a challenge and following it: `challenge_request` waits for the server's ack
 * (spinner meanwhile, F17), a refusal or a timeout is shown as a toast and re-enables the
 * button (ACKS, F-065); `challenge_declined` and `challenge_ready` come from the opponent.
 */
export function useChallengeRequest(): ChallengeRequestState {
    const socket = useSocket();
    const router = useRouter();
    const { toast } = useToast();
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [declined, setDeclined] = useState(false);

    useEffect(() => {
        if (!socket) return;
        const onReady = (data: GameIdPayload) => router.push(`/game/${data.game_id}`);
        const onDeclined = () => {
            setSending(false);
            setSent(false);
            setDeclined(true);
        };
        socket.on('challenge_ready', onReady);
        socket.on('challenge_declined', onDeclined);
        return () => {
            socket.off('challenge_ready', onReady);
            socket.off('challenge_declined', onDeclined);
        };
    }, [socket, router]);

    const send = (challenge: OutgoingChallenge) => {
        if (!socket || sending) return;
        setSending(true);
        setDeclined(false);
        emitWithAck(socket, 'challenge_request', challenge, {
            onAccepted: () => {
                setSending(false);
                setSent(true);
            },
            onRejected: (code) => {
                setSending(false);
                toast(rejectionMessage(code), 'error');
            },
        });
    };

    return { sending, sent, declined, send };
}
