'use client';

// One authenticated realtime socket per signed-in user (NODE-10). Signing in (a profile loads)
// opens it, an explicit sign-out closes it, and switching account replaces it. A profile that
// briefly goes missing (a failed refetch) does NOT close it: dropping the socket mid-game would
// start the opponent's abandonment countdown against a player who is still signed in.
import { createContext, useContext, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { usePathname } from 'next/navigation';
import { useProfile } from '@/components/ProfileProvider';
import { createGameSocket } from '@/lib/socket/connection';
import { createClient } from '@/lib/supabase/client';

const SocketContext = createContext<Socket | null>(null);

export function useSocket() {
    return useContext(SocketContext);
}

const AUTH_PAGES = ['/login', '/signup', '/reset-password'];
const DEFAULT_SOCKET_URL = 'http://127.0.0.1:3001';

/** The current session's access token; supabase-js refreshes it when it has expired. */
async function currentAccessToken(): Promise<string | null> {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
}

/**
 * The user the socket belongs to: the last profile id seen, kept until Supabase reports
 * SIGNED_OUT. (ProfileProvider sets the profile to null on any failed fetch, and refetches on
 * every token refresh, so the profile alone is not a reliable "signed out" signal.)
 */
function useSocketUserId(profileId: string | undefined): string | null {
    const [userId, setUserId] = useState<string | null>(profileId ?? null);

    useEffect(() => {
        if (profileId) setUserId(profileId);
    }, [profileId]);

    useEffect(() => {
        const { data } = createClient().auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') setUserId(null);
        });
        return () => data.subscription.unsubscribe();
    }, []);

    return userId;
}

export default function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const pathname = usePathname();
    const { profile } = useProfile();
    const isAuthPage = AUTH_PAGES.some((p) => pathname === p);
    const userId = useSocketUserId(profile?.id);

    useEffect(() => {
        if (isAuthPage || !userId) return;

        const connection = createGameSocket({
            url: process.env.NEXT_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL,
            getToken: currentAccessToken,
        });
        setSocket(connection.socket);

        return () => {
            connection.close();
            setSocket(null);
        };
    }, [isAuthPage, userId]);

    return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
