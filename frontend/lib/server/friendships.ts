import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FriendRelation, FriendshipStatus } from '@/types/friendship';
import type { ProfileSummary } from '@/types/profile';
import { betweenUsersFilter, eitherSideFilter } from './filters';

const ACCEPTED_COLUMNS =
    'id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url, rating_rapid), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url, rating_rapid)';
const PENDING_COLUMNS =
    'id, created_at, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url, rating_rapid)';

/** Accepted friendships of `userId` with both sides' profiles embedded. */
export function listAcceptedFriendships(admin: SupabaseClient, userId: string) {
    return admin.from('friendships').select(ACCEPTED_COLUMNS).or(eitherSideFilter(userId)).eq('status', 'accepted');
}

interface AcceptedFriendshipRow {
    id: string;
    requester_id: string;
    requester: unknown;
    addressee: unknown;
}

/** The other side of each friendship, de-duplicated by profile id, tagged with `friendship_id`. */
export function toFriendList(rows: AcceptedFriendshipRow[], userId: string) {
    const seen = new Set();
    const friends = [];
    for (const f of rows) {
        // many-to-one embed: one row at runtime
        const friend = (f.requester_id === userId ? f.addressee : f.requester) as
            (ProfileSummary & { id: string }) | null;
        if (!friend || seen.has(friend.id)) continue;
        seen.add(friend.id);
        friends.push({ ...friend, friendship_id: f.id });
    }
    return friends;
}

/** Incoming pending requests (I am the addressee), newest first. */
export function listIncomingRequests(admin: SupabaseClient, meId: string) {
    return admin
        .from('friendships')
        .select(PENDING_COLUMNS)
        .eq('addressee_id', meId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
}

/** `id, status` of the friendship between two users in either direction (POST /api/friends/request). */
export function findExistingFriendship(admin: SupabaseClient, meId: string, otherId: string) {
    return admin.from('friendships').select('id, status').or(betweenUsersFilter(meId, otherId)).maybeSingle();
}

/** `status, requester_id` of the friendship between two users in either direction. */
export function findFriendshipStatus(admin: SupabaseClient, meId: string, otherId: string) {
    return admin.from('friendships').select('status, requester_id').or(betweenUsersFilter(meId, otherId)).maybeSingle();
}

/** New pending request from `meId` to `addresseeId`. */
export function insertFriendRequest(admin: SupabaseClient, meId: string, addresseeId: string) {
    return admin.from('friendships').insert({ requester_id: meId, addressee_id: addresseeId, status: 'pending' });
}

/** Accept/decline a request addressed to `meId`. */
export function setRequestStatus(admin: SupabaseClient, id: string, meId: string, status: FriendshipStatus) {
    return admin.from('friendships').update({ status }).eq('id', id).eq('addressee_id', meId);
}

/** Delete a friendship `meId` is part of. */
export function deleteFriendship(admin: SupabaseClient, id: string, meId: string) {
    return admin.from('friendships').delete().eq('id', id).or(eitherSideFilter(meId));
}

/** Relation shown on a profile for an existing friendship row (or none). */
export function relationFromFriendship(
    row: { status: string; requester_id: string } | null,
    meId: string,
): FriendRelation {
    if (!row) return 'none';
    if (row.status === 'accepted') return 'friends';
    if (row.status === 'pending') return row.requester_id === meId ? 'pending_sent' : 'pending_received';
    return 'none';
}
