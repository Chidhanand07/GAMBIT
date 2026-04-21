'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { usePathname } from 'next/navigation';

const SocketContext = createContext<Socket | null>(null);

export function useSocket() {
    return useContext(SocketContext);
}

const AUTH_PAGES = ['/login', '/signup', '/reset-password'];

export default function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const pathname = usePathname();
    const isAuthPage = AUTH_PAGES.some(p => pathname === p);

    useEffect(() => {
        if (isAuthPage) return;

        const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';

        const s = io(url, {
            autoConnect: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 8000,
            transports: ['websocket', 'polling'],
        });

        s.on('connect', () => {
            console.log('[Socket] Connected:', s.id);
        });
        s.on('connect_error', (err) => console.warn('[Socket] Connection error:', err.message));
        s.on('disconnect', (reason) => console.warn('[Socket] Disconnected:', reason));

        socketRef.current = s;
        setSocket(s);

        return () => {
            s.disconnect();
            socketRef.current = null;
            setSocket(null);
        };
    }, [isAuthPage]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}
