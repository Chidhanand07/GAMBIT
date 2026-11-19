"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { loadBrowserClient } from '@/lib/supabase/lazyClient';
import { usePathname } from 'next/navigation';
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

/**
 * Pages whose guest view shows no presence figure (the landing's guest header has none): a guest
 * opens no realtime socket there, so the landing makes no third-party connection and logs nothing
 * when it is left mid-handshake (F-111). Signed-in viewers still join everywhere.
 */
const GUEST_QUIET_PATHS = ['/'];

const PresenceContext = createContext<PresenceValue>({ onlineCount: 0, onlineUserIds: NO_ONE_ONLINE });

export function usePresence() {
    return useContext(PresenceContext);
}

interface PresenceOptions {
    profileId: string | undefined;
    usernameRef: { current: string | undefined };
    update: (ids: ReadonlySet<string>) => void;
    isMounted: () => boolean;
}

/** Subscribes to the shared channel: joins it (tracked) when signed in, only listens as a guest. */
function openPresence(supabase: SupabaseClient, { profileId, usernameRef, update, isMounted }: PresenceOptions) {
    const channel = profileId
        ? supabase.channel(CHANNEL, { config: { presence: { key: profileId } } })
        : supabase.channel(CHANNEL);
    const updateCount = () => update(new Set(Object.keys(channel.presenceState())));

    // ALL handlers registered before subscribe()
    channel
        .on('presence', { event: 'sync' }, updateCount)
        .on('presence', { event: 'join' }, updateCount)
        .on('presence', { event: 'leave' }, updateCount);

    channel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED' && isMounted() && profileId) {
            await channel.track({ user_id: profileId, username: usernameRef.current || 'unknown' });
        }
    });
    return channel;
}

/**
 * The shared presence channel. A signed-in viewer joins it (tracked under their profile id); a
 * guest only listens, so the "online" figures the mockups show are real for guests too (F-104).
 */
export default function PresenceProvider({ children }: { children: React.ReactNode }) {
    const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(NO_ONE_ONLINE);
    const { profile, loading } = useProfile();
    const guestQuiet = GUEST_QUIET_PATHS.includes(usePathname() ?? '');

    const profileId = profile?.id;
    // Read when the channel subscribes; a rename alone must not re-subscribe.
    const usernameRef = useRef(profile?.username);
    useEffect(() => {
        usernameRef.current = profile?.username;
    });

    useEffect(() => {
        // Until the session is known, subscribing as a guest would only be torn down again.
        if (loading === true) return;
        if (!profileId && guestQuiet) return;
        let mounted = true;
        let joined: { supabase: SupabaseClient; channel: RealtimeChannel } | null = null;
        const update = (ids: ReadonlySet<string>) => {
            if (mounted) setOnlineUserIds(ids);
        };

        // supabase-js loads on first use, after the first paint (F-111).
        void loadBrowserClient()
            .then((supabase) => {
                if (!mounted) return;
                const isMounted = () => mounted;
                joined = { supabase, channel: openPresence(supabase, { profileId, usernameRef, update, isMounted }) };
            })
            .catch(() => {});

        return () => {
            mounted = false;
            setOnlineUserIds(NO_ONE_ONLINE);
            if (!joined) return;
            const { supabase, channel } = joined;
            const leave = profileId ? channel.untrack() : Promise.resolve();
            leave.then(() => supabase.removeChannel(channel)).catch(() => {});
        };
    }, [profileId, loading, guestQuiet]);

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
