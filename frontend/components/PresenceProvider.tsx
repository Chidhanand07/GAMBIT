"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/components/ProfileProvider';

interface PresenceValue {
    /**
     * Number of signed-in users in the shared presence set. Signed in: at least 1 (the viewer).
     * A guest watches the set without joining it, so the count is the real number (may be 0).
     */
    onlineCount: number;
    /** Presence keys (profile ids) of the users currently online. */
    onlineUserIds: ReadonlySet<string>;
}

const NO_ONE_ONLINE: ReadonlySet<string> = new Set();
const CHANNEL = 'gambit-online-users';

const PresenceContext = createContext<PresenceValue>({ onlineCount: 0, onlineUserIds: NO_ONE_ONLINE });

export function usePresence() {
    return useContext(PresenceContext);
}

/**
 * The shared presence channel. A signed-in viewer joins it (tracked under their profile id); a
 * guest only listens, so the "online" figures the mockups show are real for guests too (F-104).
 */
export default function PresenceProvider({ children }: { children: React.ReactNode }) {
    const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(NO_ONE_ONLINE);
    const { profile, loading } = useProfile();

    const profileId = profile?.id;
    // Read when the channel subscribes; a rename alone must not re-subscribe.
    const usernameRef = useRef(profile?.username);
    useEffect(() => {
        usernameRef.current = profile?.username;
    });

    useEffect(() => {
        // Until the session is known, subscribing as a guest would only be torn down again.
        if (loading === true) return;
        let mounted = true;
        const supabase = createClient();

        const channel = profileId
            ? supabase.channel(CHANNEL, { config: { presence: { key: profileId } } })
            : supabase.channel(CHANNEL);

        const updateCount = () => {
            if (!mounted) return;
            setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
        };

        // ALL handlers registered before subscribe()
        channel
            .on('presence', { event: 'sync' }, updateCount)
            .on('presence', { event: 'join' }, updateCount)
            .on('presence', { event: 'leave' }, updateCount);

        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED' && mounted && profileId) {
                await channel.track({ user_id: profileId, username: usernameRef.current || 'unknown' });
            }
        });

        return () => {
            mounted = false;
            setOnlineUserIds(NO_ONE_ONLINE);
            const leave = profileId ? channel.untrack() : Promise.resolve();
            leave.then(() => supabase.removeChannel(channel)).catch(() => {});
        };
    }, [profileId, loading]);

    const value = useMemo(
        () => ({
            onlineCount: profileId ? Math.max(1, onlineUserIds.size) : onlineUserIds.size,
            onlineUserIds,
        }),
        [profileId, onlineUserIds],
    );

    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
}
