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
