'use client';

import type { RefObject } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';
import { MenuDivider, MenuItem } from './MenuItem';
import { Popover } from './Popover';
import type { HeaderNav, HeaderNotification, HeaderNotifications, HeaderRoutes, HeaderUser } from './headerTypes';

interface MenuShellProps {
    open: boolean;
    onClose: () => void;
    containerRef: RefObject<HTMLElement | null>;
    triggerRef: RefObject<HTMLElement | null>;
}

const NAV_ICONS: Record<string, IconName> = { play: 'play', leaderboard: 'trophy', analysis: 'chart' };

interface AccountMenuProps extends MenuShellProps {
    user: HeaderUser;
    routes: HeaderRoutes;
    onSignOut: () => void;
}

/** Avatar menu: who is signed in, profile / leaderboard / settings, sign out. */
export function AccountMenu({ user, routes, onSignOut, ...shell }: AccountMenuProps) {
    return (
        <Popover label="Account" {...shell}>
            <div className="flex items-center gap-3 px-3 pb-[10px] pt-2">
                <Avatar name={user.name} src={user.avatarUrl} size="md" />
                <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="text-[13px] text-ink-muted">{user.ratingLabel}</span>
                </span>
            </div>
            <MenuDivider />
            <MenuItem icon="user" href={user.profileHref} onSelect={shell.onClose}>
                My Profile
            </MenuItem>
            <MenuItem icon="trophy" href={routes.leaderboard} onSelect={shell.onClose}>
                Leaderboard
            </MenuItem>
            <MenuItem icon="settings" href={routes.settings} onSelect={shell.onClose}>
                Settings
            </MenuItem>
            <MenuDivider />
            <MenuItem icon="signOut" tone="danger" onSelect={onSignOut}>
                Sign Out
            </MenuItem>
        </Popover>
    );
}

interface SiteMenuProps extends MenuShellProps {
    nav: HeaderNav;
    routes: HeaderRoutes;
}

/** The menu button's list: Home plus the three main sections. */
export function SiteMenu({ nav, routes, ...shell }: SiteMenuProps) {
    return (
        <Popover label="Site" {...shell}>
            <MenuItem icon="home" href={routes.home} onSelect={shell.onClose}>
                Home
            </MenuItem>
            {nav.links.map((link) => (
                <MenuItem key={link.key} icon={NAV_ICONS[link.key]} href={link.href} onSelect={shell.onClose}>
                    {link.label}
                </MenuItem>
            ))}
        </Popover>
    );
}

function NotificationRow({ item }: { item: HeaderNotification }) {
    return (
        <div role="menuitem" tabIndex={-1} data-unread={item.unread} className="gi items-start px-3 py-[10px]">
            <span
                aria-hidden="true"
                className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full bg-accent', !item.unread && 'opacity-0')}
            />
            <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{item.title}</span>
                {item.detail && <span className="text-[13px] text-ink-muted">{item.detail}</span>}
            </span>
        </div>
    );
}

function NotificationBody({ notifications }: { notifications: HeaderNotifications }) {
    const { items, loading, loadError } = notifications;
    const note = 'px-3 py-[10px] text-[14px]';
    if (loading)
        return (
            <div role="status" aria-label="Loading notifications" className={cn(note, 'text-ink-muted')}>
                Loading…
            </div>
        );
    if (loadError && items.length === 0)
        return (
            <div role="alert" className={cn(note, 'text-danger')}>
                {loadError}
            </div>
        );
    if (items.length === 0) return <div className={cn(note, 'text-ink-muted')}>No notifications</div>;
    return (
        <div className="flex max-h-[360px] flex-col gap-[2px] overflow-y-auto">
            {items.map((item) => (
                <NotificationRow key={item.id} item={item} />
            ))}
        </div>
    );
}

interface NotificationsMenuProps extends MenuShellProps {
    notifications: HeaderNotifications;
}

/**
 * The bell's panel: heading and "Mark all read" (always there, as in the mockups; disabled while
 * nothing is unread), then the list.
 */
export function NotificationsMenu({ notifications, ...shell }: NotificationsMenuProps) {
    return (
        <Popover label="Notifications" className="w-[320px] max-w-[calc(100vw-48px)]" {...shell}>
            <div className="flex items-center justify-between gap-3 pb-2 pl-3 pr-1 pt-1">
                <span className="font-display text-[17px] font-semibold">Notifications</span>
                <button
                    type="button"
                    onClick={notifications.onMarkAllRead}
                    disabled={!notifications.hasUnread}
                    className="min-h-[44px] rounded-pill border-0 bg-transparent px-3 text-[14px] font-semibold text-accent disabled:cursor-default disabled:opacity-50"
                >
                    Mark all read
                </button>
            </div>
            <MenuDivider className="mx-1 mb-[6px] mt-0" />
            {notifications.markReadError && (
                <div role="alert" className="px-3 pb-2 text-[13px] text-danger">
                    {notifications.markReadError}
                </div>
            )}
            <NotificationBody notifications={notifications} />
        </Popover>
    );
}
