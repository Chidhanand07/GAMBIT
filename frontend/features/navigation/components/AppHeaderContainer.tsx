'use client';

import { usePathname, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import type { HeaderNotifications, HeaderSession } from '@/components/layout/headerTypes';
import { useProfile } from '@/components/ProfileProvider';
import { usePresence } from '@/components/PresenceProvider';
import { createClient } from '@/lib/supabase/client';
import { useChallengeBanner } from '../hooks/useChallengeBanner';
import { useNotifications, type NotificationError } from '../hooks/useNotifications';
import { HEADER_ROUTES, navStateFor } from '../navLinks';
import { toHeaderNotification } from '../notificationView';
import type { NavProfile } from '../types';
import { ChallengeToast } from './ChallengeToast';

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
 * online count (PresenceProvider), notifications (API), incoming challenges (socket) and sign out.
 */
export default function AppHeaderContainer() {
    const pathname = usePathname();
    const router = useRouter();
    const { profile, loading } = useProfile();
    const { onlineCount } = usePresence();
    const notifications = useHeaderNotifications(profile?.id);
    const challenge = useChallengeBanner(profile);

    const signOut = async () => {
        await createClient().auth.signOut();
        router.push('/');
        router.refresh();
    };

    let session: HeaderSession = { status: 'guest' };
    if (loading) session = { status: 'loading' };
    else if (profile)
        session = { status: 'signed-in', user: userView(profile), notifications, onSignOut: () => void signOut() };

    return (
        <>
            {challenge.challengeBanner && (
                <ChallengeToast
                    challenge={challenge.challengeBanner}
                    onAccept={challenge.accept}
                    onDecline={challenge.decline}
                />
            )}
            <AppHeader nav={navStateFor(pathname)} routes={HEADER_ROUTES} session={session} onlineCount={onlineCount} />
        </>
    );
}
