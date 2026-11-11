// `public.friendships` rows and the /api/friends response shapes (migrations 00001, 00004).
import type { ProfileSummary } from './profile';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

/** Relationship as seen from the viewer (GET /api/friends/status/[username]). */
export type FriendRelation = 'none' | 'self' | 'pending_sent' | 'pending_received' | 'friends';

export interface Friendship {
    id: string;
    requester_id: string;
    addressee_id: string;
    status: FriendshipStatus;
    created_at: string;
    updated_at?: string;
}

/** GET /api/friends: the other side of each accepted friendship. */
export type Friend = ProfileSummary & { friendship_id: string };

/** GET /api/friends/pending: incoming requests with the requester embedded. */
export interface PendingFriendRequest {
    id: string;
    created_at: string;
    requester: ProfileSummary | null;
}
