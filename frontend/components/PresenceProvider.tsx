"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/components/ProfileProvider';

interface PresenceValue {
    /** Number of signed-in users in the shared presence set (at least 1: the viewer). */
    onlineCount: number;
    /** Presence keys (profile ids) of the users currently online; empty while signed out. */
    onlineUserIds: ReadonlySet<string>;
}

const NO_ONE_ONLINE: ReadonlySet<string> = new Set();

const PresenceContext = createContext<PresenceValue>({ onlineCount: 1, onlineUserIds: NO_ONE_ONLINE });

export function usePresence() {
    return useContext(PresenceContext);
}

export default function PresenceProvider({ children }: { children: React.ReactNode }) {
    const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(NO_ONE_ONLINE);
    const { profile } = useProfile();

    const profileId = profile?.id;
    // Read when the channel subscribes; a rename alone must not re-subscribe.
    const usernameRef = useRef(profile?.username);
    useEffect(() => {
        usernameRef.current = profile?.username;
    });

    useEffect(() => {
        if (!profileId) return;
        let mounted = true;
        const supabase = createClient();

        const channel = supabase.channel('gambit-online-users', {
            config: { presence: { key: profileId } },
        });

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
            if (status === 'SUBSCRIBED' && mounted) {
                await channel.track({ user_id: profileId, username: usernameRef.current || 'unknown' });
            }
        });

        return () => {
            mounted = false;
            channel.untrack().then(() => supabase.removeChannel(channel)).catch(() => {});
        };
    }, [profileId]);

    // A signed-out viewer has no subscription, so whatever the last one saw no longer applies.
    const visibleIds = profileId ? onlineUserIds : NO_ONE_ONLINE;
    const value = useMemo(
        () => ({ onlineCount: Math.max(1, visibleIds.size), onlineUserIds: visibleIds }),
        [visibleIds],
    );

    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
}
