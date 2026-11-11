import { useEffect, useState } from 'react';

export type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken';

const MIN_USERNAME_LENGTH = 3;
const CHECK_DEBOUNCE_MS = 500;
const DEFAULT_SOCKET_URL = 'http://127.0.0.1:3001';

async function fetchUsernameStatus(username: string): Promise<UsernameStatus> {
    try {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL;
        const res = await fetch(`${socketUrl}/api/users/check-username?u=${encodeURIComponent(username)}`);
        if (!res.ok) return 'idle';
        const data: { available?: boolean } = await res.json();
        return data.available ? 'available' : 'taken';
    } catch {
        return 'idle';
    }
}

/** Debounced (500 ms) username availability check against the realtime server. */
export function useUsernameAvailability(username: string): UsernameStatus {
    const [status, setStatus] = useState<UsernameStatus>('idle');

    useEffect(() => {
        if (username.length < MIN_USERNAME_LENGTH) {
            setStatus('idle');
            return;
        }

        const timer = setTimeout(async () => {
            setStatus('checking');
            setStatus(await fetchUsernameStatus(username));
        }, CHECK_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [username]);

    return status;
}
