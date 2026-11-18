'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { usePathname } from 'next/navigation';
import { loadBrowserClient } from '@/lib/supabase/lazyClient';
import { useProfile } from '@/components/ProfileProvider';
import { presenceSets, type PresenceMeta, type PresenceSets, type TabStatus } from '@/lib/presence/presenceStatus';
import { useUserSettings } from '@/features/settings/SettingsProvider';
import { useIdleStatus } from './useIdleStatus';

interface PresenceValue {
    /**
     * Number of signed-in users in the shared presence set. Signed in: at least 1 (the viewer).
     * A guest watches the set without joining it, so the count is the real number (may be 0).
     */
    onlineCount: number;
    /** Presence keys (profile ids) of the users currently online, away ones included. */
    onlineUserIds: ReadonlySet<string>;
    /** Of those, the users whose every tab reports away (no input for AWAY_AFTER_MS). */
    awayUserIds: ReadonlySet<string>;
}

const NO_ONE: ReadonlySet<string> = new Set();
const NOBODY: PresenceSets = { present: NO_ONE, away: NO_ONE };
const CHANNEL = 'gambit-online-users';

/**
 * Pages whose guest view shows no presence figure (the landing's guest header has none): a guest
 * opens no realtime socket there, so the landing makes no third-party connection and logs nothing
 * when it is left mid-handshake (F-111). Signed-in viewers still join everywhere.
 */
const GUEST_QUIET_PATHS = ['/'];

const PresenceContext = createContext<PresenceValue>({ onlineCount: 0, onlineUserIds: NO_ONE, awayUserIds: NO_ONE });

export function usePresence() {
    return useContext(PresenceContext);
}

/** The payload this tab tracks: who it is and whether it is idle. */
function payload(profileId: string, username: string | undefined, status: TabStatus) {
    return { user_id: profileId, username: username || 'unknown', status };
}

interface PresenceOptions {
    profileId: string | undefined;
    usernameRef: { current: string | undefined };
    statusRef: { current: TabStatus };
    showOnlineRef: { current: boolean };
    update: (sets: PresenceSets) => void;
    onSubscribed: (channel: RealtimeChannel) => void;
    isMounted: () => boolean;
}

/** Subscribes to the shared channel: joins it (tracked) when signed in, only listens as a guest. */
function openPresence(supabase: SupabaseClient, options: PresenceOptions) {
    const { profileId, usernameRef, statusRef, showOnlineRef, update, onSubscribed, isMounted } = options;
    const channel = profileId
        ? supabase.channel(CHANNEL, { config: { presence: { key: profileId } } })
        : supabase.channel(CHANNEL);
    const refresh = () => update(presenceSets(channel.presenceState() as Record<string, PresenceMeta[]>));

    // ALL handlers registered before subscribe()
    channel
        .on('presence', { event: 'sync' }, refresh)
        .on('presence', { event: 'join' }, refresh)
        .on('presence', { event: 'leave' }, refresh);

    channel.subscribe(async (subscription: string) => {
        if (subscription !== 'SUBSCRIBED' || !isMounted() || !profileId) return;
        onSubscribed(channel);
        // "Show when I am online" off: listen without announcing (F-140).
        if (showOnlineRef.current) await channel.track(payload(profileId, usernameRef.current, statusRef.current));
    });
    return channel;
}

/**
 * Whether this user announces themselves: "Show when I am online" (ADR F-140). Presence is
 * self-announced, so not tracking is what hides the badge. Until the settings have loaded, or
 * when they failed to load, the user is not announced (fail closed).
 */
function useShowOnline(): boolean {
    const { account, status } = useUserSettings();
    return status === 'ready' && account.privacy.showOnline;
}

/**
 * The shared presence channel. A signed-in viewer joins it (tracked under their profile id, with
 * the tab's idle status, F-131); a guest only listens, so the "online" figures the mockups show
 * are real for guests too (F-104), except on the landing (F-111). A user who turned "Show when I
 * am online" off listens without announcing themselves (F-140).
 */
export default function PresenceProvider({ children }: { children: React.ReactNode }) {
    const [sets, setSets] = useState<PresenceSets>(NOBODY);
    const { profile, loading } = useProfile();
    const guestQuiet = GUEST_QUIET_PATHS.includes(usePathname() ?? '');
    const showOnline = useShowOnline();

    const profileId = profile?.id;
    const status = useIdleStatus(Boolean(profileId));
    // Read when the channel subscribes; a rename or an idle change alone must not re-subscribe.
    const usernameRef = useRef(profile?.username);
    const statusRef = useRef(status);
    const showOnlineRef = useRef(showOnline);
    const channelRef = useRef<RealtimeChannel | null>(null);
    useEffect(() => {
        usernameRef.current = profile?.username;
        statusRef.current = status;
    });

    useEffect(() => {
        // Until the session is known, subscribing as a guest would only be torn down again.
        if (loading === true) return;
        if (!profileId && guestQuiet) return;
        let mounted = true;
        let joined: { supabase: SupabaseClient; channel: RealtimeChannel } | null = null;
        const update = (next: PresenceSets) => {
            if (mounted) setSets(next);
        };
        const onSubscribed = (channel: RealtimeChannel) => {
            channelRef.current = channel;
        };

        // supabase-js loads on first use, after the first paint (F-111).
        void loadBrowserClient()
            .then((supabase) => {
                if (!mounted) return;
                const isMounted = () => mounted;
                const opts = { profileId, usernameRef, statusRef, showOnlineRef, update, onSubscribed, isMounted };
                joined = { supabase, channel: openPresence(supabase, opts) };
            })
            .catch(() => {});

        return () => {
            mounted = false;
            channelRef.current = null;
            setSets(NOBODY);
            if (!joined) return;
            const { supabase, channel } = joined;
            const leave = profileId ? channel.untrack() : Promise.resolve();
            leave.then(() => supabase.removeChannel(channel)).catch(() => {});
        };
    }, [profileId, loading, guestQuiet]);

    // Going idle or coming back re-tracks this tab's payload on the open channel.
    useEffect(() => {
        if (!profileId || !showOnlineRef.current) return;
        void channelRef.current?.track(payload(profileId, usernameRef.current, status)).catch(() => {});
    }, [status, profileId]);

    // The setting changed while subscribed: announce or withdraw without re-subscribing.
    useEffect(() => {
        if (showOnlineRef.current === showOnline) return;
        showOnlineRef.current = showOnline;
        const channel = channelRef.current;
        if (!channel || !profileId) return;
        const change = showOnline
            ? channel.track(payload(profileId, usernameRef.current, statusRef.current))
            : channel.untrack();
        change.catch(() => {});
    }, [showOnline, profileId]);

    const value = useMemo(
        () => ({
            onlineCount: profileId ? Math.max(1, sets.present.size) : sets.present.size,
            onlineUserIds: sets.present,
            awayUserIds: sets.away,
        }),
        [profileId, sets],
    );

    return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
