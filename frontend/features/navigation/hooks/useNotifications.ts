'use client';

import { useCallback, useEffect, useState } from 'react';
import { getNotifications, markNotificationsRead } from '@/lib/api/notifications';
import type { NavNotification } from '../types';

export type NotificationError = 'load' | 'mark-read' | null;

async function fetchNotifications(): Promise<NavNotification[]> {
    const res = await getNotifications();
    if (!res.ok) throw new Error(`notifications request failed: ${res.status}`);
    return res.json();
}

async function putAllRead(): Promise<void> {
    const res = await markNotificationsRead();
    if (!res.ok) throw new Error(`mark-read request failed: ${res.status}`);
}

/**
 * Bell notifications for the signed-in user (`userId`). They load when the
 * user signs in, so the unread dot shows without opening the bell, and again
 * on every `load()` (opening the bell). "Mark all read" is optimistic and is
 * rolled back when the request fails. Failures are reported in `error` (F15).
 */
export function useNotifications(userId: string | undefined) {
    const [notifications, setNotifications] = useState<NavNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<NotificationError>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setNotifications(await fetchNotifications());
            setError(null);
        } catch {
            setError('load');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (userId) void load();
    }, [userId, load]);

    const markAllRead = async () => {
        const before = notifications;
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        try {
            await putAllRead();
            setError(null);
        } catch {
            setNotifications(before);
            setError('mark-read');
        }
    };

    const hasUnread = userId !== undefined && notifications.some((n) => !n.read);
    return { notifications, loading, error, hasUnread, load, markAllRead };
}
