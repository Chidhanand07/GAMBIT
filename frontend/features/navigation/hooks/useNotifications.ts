'use client';

import { useState } from 'react';
import { getNotifications, markNotificationsRead } from '@/lib/api/notifications';
import type { NavNotification } from '../types';

/** Bell notifications: loaded on demand, marked read optimistically. Errors are ignored. */
export function useNotifications() {
    const [notifications, setNotifications] = useState<NavNotification[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await getNotifications();
            if (res.ok) setNotifications(await res.json());
        } catch {
            /* ignore: notifications are best-effort */
        } finally {
            setLoading(false);
        }
    };

    const markAllRead = async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        try {
            await markNotificationsRead();
        } catch {
            /* ignore: notifications are best-effort */
        }
    };

    const hasUnread = notifications.some((n) => !n.read);
    return { notifications, loading, hasUnread, load, markAllRead };
}
