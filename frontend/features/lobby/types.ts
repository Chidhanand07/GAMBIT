// Types local to the lobby feature.
import type { useProfile } from '@/components/ProfileProvider';

/** The signed-in profile exactly as ProfileProvider exposes it. */
export type LobbyProfile = NonNullable<ReturnType<typeof useProfile>['profile']>;

/** Steps of the "Play a Friend" modal. */
export type InviteState = 'config' | 'generating' | 'share';

/** Base minutes and increment of the current lobby selection. */
export interface TcMinutes {
    mins: number;
    inc: number;
}

/** A friend as the lobby's "Play a friend" list shows them. */
export interface LobbyFriend {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    /** Rating in the pool of the selected time control (GET /api/friends returns every pool, F-125). */
    rating: number;
    /** In the shared presence set right now. */
    online: boolean;
}

/** Which play-mode panel is open under the "You're playing" bar. */
export type LobbyStage = 'none' | 'computer' | 'friends';
