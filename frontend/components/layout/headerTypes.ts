// Props of the app header (components/layout/AppHeader.tsx): plain view data, no Supabase rows.
import type { NavPillLink, NavKey, NavPillRest } from './NavPill';

export interface HeaderUser {
    /** Display name, falling back to the username. */
    name: string;
    avatarUrl: string | null;
    /** e.g. "1502 rapid". */
    ratingLabel: string;
    profileHref: string;
}

export interface HeaderNotification {
    id: string;
    title: string;
    /** e.g. "chiruparande · Blitz 3+0 · 2m ago"; null when there is nothing to add. */
    detail: string | null;
    unread: boolean;
}

export interface HeaderNotifications {
    items: readonly HeaderNotification[];
    loading: boolean;
    /** Shown instead of the list when loading failed and there is nothing to show. */
    loadError: string | null;
    /** Shown above the list when "Mark all read" failed. */
    markReadError: string | null;
    hasUnread: boolean;
    /** Called when the panel opens (the container reloads the list). */
    onOpen: () => void;
    onMarkAllRead: () => void;
}

export type HeaderSession =
    | { status: 'loading' }
    | { status: 'guest' }
    | { status: 'signed-in'; user: HeaderUser; notifications: HeaderNotifications; onSignOut: () => void };

/** App routes the header links to. */
export interface HeaderRoutes {
    home: string;
    signIn: string;
    signUp: string;
    leaderboard: string;
    settings: string;
}

export interface HeaderNav {
    links: readonly NavPillLink[];
    current: NavKey | null;
    rest: NavPillRest;
}
