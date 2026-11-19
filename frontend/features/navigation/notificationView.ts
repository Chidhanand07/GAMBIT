import type { HeaderNotification } from '@/components/layout/headerTypes';
import { classifyTimeControl, SPEED_BUCKET_LABELS, timeControlOf } from '@/lib/chess/timeControl';
import type { NavNotification } from './types';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Titles for rows without a message of their own; unknown types show the raw type. */
const TITLES: Record<string, string> = {
    challenge: 'New challenge',
    friend_request: 'Friend request',
};

/** "just now", "2m ago", "1h ago", "3d ago". */
export function timeAgo(iso: string, now: number): string | null {
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return null;
    const ms = Math.max(0, now - at);
    if (ms < MINUTE) return 'just now';
    if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
    return `${Math.floor(ms / DAY)}d ago`;
}

/** "Blitz 3+0" for a stored time control. */
export function speedLabel(stored: unknown): string {
    const { minutes, incrementSeconds } = timeControlOf(stored);
    return `${SPEED_BUCKET_LABELS[classifyTimeControl(stored)]} ${minutes}+${incrementSeconds}`;
}

/**
 * A notification row as the header shows it (Main.dc.html): the message (payload, then top-level,
 * then a title for the type) and "from · time control · age" when the payload carries them.
 */
export function toHeaderNotification(n: NavNotification, now: number): HeaderNotification {
    const p = n.payload;
    const detail = [p?.from_username, p?.time_control ? speedLabel(p.time_control) : null, timeAgo(n.created_at, now)]
        .filter(Boolean)
        .join(' · ');
    return {
        id: n.id,
        title: p?.message || n.message || TITLES[n.type] || n.type,
        detail: detail || null,
        unread: !n.read,
    };
}
