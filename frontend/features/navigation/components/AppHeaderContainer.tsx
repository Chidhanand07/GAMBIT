'use client';

import { usePathname, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import type { HeaderNotifications, HeaderSession } from '@/components/layout/headerTypes';
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';
import { loadBrowserClient } from '@/lib/supabase/lazyClient';
import { useNotifications, type NotificationError } from '../hooks/useNotifications';
import { HEADER_ROUTES, hidesAppHeader, navStateFor } from '../navLinks';
import { toHeaderNotification } from '../notificationView';
import type { NavProfile } from '../types';
import type { Viewer } from '@/types/viewer';

const DEFAULT_RAPID_RATING = 1200;

const ERROR_TEXT: Record<Exclude<NotificationError, null>, string> = {
    load: 'Could not load notifications.',
    'mark-read': 'Could not mark notifications read. Try again.',
};

function useHeaderNotifications(userId: string | undefined): HeaderNotifications {
    const notifs = useNotifications(userId);
    // Ages ("2m ago") are computed per render; the list re-renders whenever it is opened or changes.
    const now = Date.now();
    return {
        items: notifs.notifications.map((n) => toHeaderNotification(n, now)),
        loading: notifs.loading,
        loadError: notifs.error === 'load' ? ERROR_TEXT.load : null,
        markReadError: notifs.error === 'mark-read' ? ERROR_TEXT['mark-read'] : null,
        hasUnread: notifs.hasUnread,
        onOpen: () => void notifs.load(),
        onMarkAllRead: () => void notifs.markAllRead(),
    };
}

const userView = (profile: NavProfile) => {
    const name = profile.display_name || profile.username;
    return {
        name,
        avatarUrl: profile.avatar_url,
        ratingLabel: `${Math.round(profile.rating_rapid ?? DEFAULT_RAPID_RATING)} rapid`,
        profileHref: `/profile/${profile.username}`,
    };
};

/**
 * Wires the presentational AppHeader to the real data: profile/session (ProfileProvider),
 * online count (PresenceProvider), notifications (API) and sign out. Incoming challenges are
 * ChallengeListener's. Not shown on the live game screen (Game.dc.html has no header), nor on
 * the landing page, which renders a SeededAppHeader itself.
 */
export default function AppHeaderContainer() {
    const pathname = usePathname();
    return hidesAppHeader(pathname) ? null : <ConnectedAppHeader pathname={pathname} />;
}

/**
 * The header of a page that resolved its viewer on the server (the landing): until
 * ProfileProvider has loaded, it shows that viewer instead of the loading placeholder, so the
 * first paint already has the right right-hand cluster and nothing shifts when the client catches up.
 */
export function SeededAppHeader({ viewer }: { viewer: Viewer }) {
    const pathname = usePathname();
    return <ConnectedAppHeader pathname={pathname} seed={viewer} />;
}

/** The profile to show: the provider's once it has loaded, else the server's view of the viewer. */
function useHeaderProfile(seed: Viewer | undefined): { profile: NavProfile | null; loading: boolean } {
    const { profile, loading } = useProfile();
    if (!loading || !seed || seed.status === 'unknown') return { profile, loading };
    return { profile: seed.status === 'signed-in' ? seed.profile : null, loading: false };
}

function ConnectedAppHeader({ pathname, seed }: { pathname: string; seed?: Viewer }) {
    const router = useRouter();
    const { profile, loading } = useHeaderProfile(seed);
    const { onlineCount } = usePresence();
    const notifications = useHeaderNotifications(profile?.id);

    const signOut = async () => {
        await (await loadBrowserClient()).auth.signOut();
        router.push('/');
        router.refresh();
    };

    let session: HeaderSession = { status: 'guest' };
    if (loading) session = { status: 'loading' };
    else if (profile)
        session = { status: 'signed-in', user: userView(profile), notifications, onSignOut: () => void signOut() };

    return <AppHeader nav={navStateFor(pathname)} routes={HEADER_ROUTES} session={session} onlineCount={onlineCount} />;
}
