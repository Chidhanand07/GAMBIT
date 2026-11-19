import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { wantsNotification } from './preferences';

const RECENT_NOTIFICATIONS_LIMIT = 30;

/** The user's 30 most recent notifications, newest first. */
export function listRecentNotifications(admin: SupabaseClient, userId: string) {
    return admin
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(RECENT_NOTIFICATIONS_LIMIT);
}

/** Marks every unread notification of the user as read. */
export function markAllNotificationsRead(admin: SupabaseClient, userId: string) {
    return admin.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

/**
 * Bell notification for the addressee of a new friend request, unless they turned "Friend
 * requests" off (ADR F-140). Best effort: the request itself is already stored, so a failure
 * here is logged, never surfaced.
 */
export async function notifyFriendRequest(admin: SupabaseClient, fromId: string, toId: string): Promise<void> {
    if (!(await wantsNotification(admin, toId, 'friendRequests'))) return;
    const { data: sender } = await admin.from('profiles').select('username').eq('id', fromId).maybeSingle();
    const { error } = await admin.from('notifications').insert({
        user_id: toId,
        type: 'friend_request',
        payload: { from_user_id: fromId, from_username: (sender as { username?: string } | null)?.username ?? null },
        read: false,
    });
    if (error) console.error('[notifications] friend request notification failed:', error.message);
}
