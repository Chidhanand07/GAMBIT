// `public.notifications` rows (migration 00001) and the payloads the realtime server writes.
import type { PlayerColor } from './game';
import type { TimeControl } from './timeControl';

/** Notification `type` values written by the realtime server; the schema comment lists more. */
export type NotificationType = 'friend_request' | 'challenge' | (string & {});

export interface FriendRequestNotificationPayload {
    from_user_id: string;
    from_username?: string;
}

export interface ChallengeNotificationPayload {
    from_user_id: string;
    from_username: string;
    time_control: TimeControl;
    is_rated: boolean;
    color: PlayerColor | 'random';
}

export interface Notification {
    id: string;
    user_id: string;
    type: NotificationType;
    /** JSONB; the Navbar also reads an optional `message` that no writer in this repo sets. */
    payload: (Partial<FriendRequestNotificationPayload & ChallengeNotificationPayload> & { message?: string }) | null;
    read: boolean;
    created_at: string;
}
