'use client';

// One authenticated realtime socket per signed-in user (NODE-10). The socket exists only
// while a profile is loaded: signing out closes it, signing in (or switching account) opens
// a new one whose handshake carries that session's access token.
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

export default function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const pathname = usePathname();
    const { profile } = useProfile();
    const isAuthPage = AUTH_PAGES.some((p) => pathname === p);
    const userId = profile?.id;

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
