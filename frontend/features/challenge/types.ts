import type { Profile } from '@/types/profile';
import type { PlayerColor } from '@/types/game';

/** The opponent row returned by GET /api/profile/[username], as far as the challenge page reads it. */
export type ChallengeOpponent = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> &
    Partial<Pick<Profile, 'rating_rapid'>>;

/** Colour the challenger asks for (mirrors the non-exported ChallengeColor in types/socket.ts). */
export type ChallengeColor = PlayerColor | 'random';
