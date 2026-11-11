import type { Notification } from '@/types/notification';

/** A notification row as the bell renders it; a top-level `message` is read as a fallback. */
export type NavNotification = Notification & { message?: string };

/** The profile fields the Navbar reads (ProfileProvider's profile satisfies this). */
export interface NavProfile {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    rating_rapid?: number | null;
}
