import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

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
