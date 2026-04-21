"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/components/ProfileProvider';

const PresenceContext = createContext<{ onlineCount: number }>({ onlineCount: 1 });

export function usePresence() {
    return useContext(PresenceContext);
}

export default function PresenceProvider({ children }: { children: React.ReactNode }) {
    const [onlineCount, setOnlineCount] = useState(1);
    const { profile } = useProfile();

    useEffect(() => {
        if (!profile?.id) return;
        let mounted = true;
        const supabase = createClient();

        const channel = supabase.channel('gambit-online-users', {
            config: { presence: { key: profile.id } },
        });

        const updateCount = () => {
            if (!mounted) return;
            setOnlineCount(Math.max(1, Object.keys(channel.presenceState()).length));
        };

        // ALL handlers registered before subscribe()
        channel
            .on('presence', { event: 'sync' }, updateCount)
            .on('presence', { event: 'join' }, updateCount)
            .on('presence', { event: 'leave' }, updateCount);

        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED' && mounted) {
                await channel.track({ user_id: profile.id, username: profile.username || 'unknown' });
            }
        });

        return () => {
            mounted = false;
            channel.untrack().then(() => supabase.removeChannel(channel)).catch(() => {});
        };
    }, [profile?.id]);

    return (
        <PresenceContext.Provider value={{ onlineCount }}>
            {children}
        </PresenceContext.Provider>
    );
}
