import type { RefObject } from 'react';
import { Bell } from 'lucide-react';
import { hoverStyles } from '../hover';
import type { NavNotification } from '../types';

const MAX_SHOWN = 8;

const bellHover = hoverStyles(
    { color: 'var(--text-primary)', background: 'var(--bg-hover)' },
    { color: 'var(--text-secondary)', background: '' },
);

function NotificationList({ notifications, loading }: { notifications: NavNotification[]; loading: boolean }) {
    if (loading)
        return (
            <div className="p-4 flex justify-center">
                <div
                    className="w-5 h-5 border-2 border-t-accent rounded-full animate-spin"
                    style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
                />
            </div>
        );
    if (notifications.length === 0)
        return (
            <div className="p-4 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                No notifications
            </div>
        );
    return (
        <>
            {notifications.slice(0, MAX_SHOWN).map((n) => (
                <div
                    key={n.id}
                    className={`px-4 py-3 text-sm transition-colors hover:bg-hover ${!n.read ? '' : 'opacity-60'}`}
                    style={{ color: !n.read ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                    {n.payload?.message || n.message || n.type}
                </div>
            ))}
        </>
    );
}

interface NotificationBellProps {
    panelRef: RefObject<HTMLDivElement | null>;
    isOpen: boolean;
    onToggle: () => void;
    notifications: NavNotification[];
    loading: boolean;
    hasUnread: boolean;
    onMarkAllRead: () => void;
}

export function NotificationBell(props: NotificationBellProps) {
    const { panelRef, isOpen, onToggle, notifications, loading, hasUnread, onMarkAllRead } = props;
    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={onToggle}
                className="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                {...bellHover}
            >
                <Bell size={17} strokeWidth={1.5} />
                {hasUnread && (
                    <span
                        className="absolute top-1 right-1 w-2 h-2 rounded-full border"
                        style={{ background: 'var(--accent)', borderColor: 'var(--bg-elevated)' }}
                    />
                )}
            </button>
            {isOpen && (
                <div
                    className="absolute top-[40px] right-0 w-72 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}
                >
                    <div
                        className="px-4 py-2.5 border-b flex items-center justify-between"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        <span
                            className="text-xs font-medium uppercase tracking-wider"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Notifications
                        </span>
                        {hasUnread && (
                            <button
                                onClick={onMarkAllRead}
                                className="text-xs hover:underline"
                                style={{ color: 'var(--accent)' }}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                        <NotificationList notifications={notifications} loading={loading} />
                    </div>
                </div>
            )}
        </div>
    );
}
