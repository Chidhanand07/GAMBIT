'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { postJoinInvite } from '@/lib/api/invite';

interface JoinInviteArgs {
    socketUrl: string;
    token: string;
    /** False for a signed-out viewer (no /api/profile/me). */
    signedIn: boolean;
}

/**
 * "Accept & Play" on an invite: POST the join with the Supabase access token,
 * then open the game. Without a profile or a session the viewer goes to
 * /login and back; `joining` is reset on every path that does not open the
 * game, so the button is never left on "Joining..." (F17).
 */
export function useJoinInvite({ socketUrl, token, signedIn }: JoinInviteArgs) {
    const router = useRouter();
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loginUrl = `/login?redirect=/join/${token}`;

    const join = async () => {
        if (!signedIn) {
            router.push(loginUrl);
            return;
        }
        setJoining(true);
        try {
            const {
                data: { session },
            } = await createClient().auth.getSession();
            if (!session) {
                setJoining(false);
                router.push(loginUrl);
                return;
            }
            const res = await postJoinInvite(socketUrl, token, session.access_token);
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Failed to join');
                setJoining(false);
                return;
            }
            router.push(`/game/${data.id}`);
        } catch (e) {
            setError((e as Error).message);
            setJoining(false);
        }
    };

    return { joining, error, join };
}
