'use client';

import { useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { cn } from '@/lib/design/cn';
import { AccountMenu, NotificationsMenu, SiteMenu } from './HeaderMenus';
import type { HeaderNav, HeaderNotifications, HeaderRoutes, HeaderUser } from './headerTypes';

type OpenMenu = 'account' | 'site' | 'notifications' | null;

const ROUND_BUTTON =
    'relative flex h-11 w-11 items-center justify-center rounded-full border-1 border-line bg-surface p-0 text-ink';

interface HeaderAccountProps {
    user: HeaderUser;
    onlineCount: number;
    notifications: HeaderNotifications;
    onSignOut: () => void;
    nav: HeaderNav;
    routes: HeaderRoutes;
}

/** Signed-in right cluster (Main.dc.html): online count, bell, account button, site menu button. */
export function HeaderAccount({ user, onlineCount, notifications, onSignOut, nav, routes }: HeaderAccountProps) {
    const [open, setOpen] = useState<OpenMenu>(null);
    const clusterRef = useRef<HTMLDivElement>(null);
    const bellRef = useRef<HTMLButtonElement>(null);
    const accountRef = useRef<HTMLButtonElement>(null);
    const siteRef = useRef<HTMLButtonElement>(null);
    const close = () => setOpen(null);
    const signOut = () => {
        close();
        onSignOut();
    };
    const toggle = (menu: Exclude<OpenMenu, null>) => {
        if (menu === 'notifications' && open !== 'notifications') notifications.onOpen();
        setOpen(open === menu ? null : menu);
    };
    const shell = (menu: Exclude<OpenMenu, null>, triggerRef: typeof bellRef) => ({
        open: open === menu,
        onClose: close,
        containerRef: clusterRef,
        triggerRef,
    });

    return (
        <div ref={clusterRef} className="relative z-30 flex flex-wrap items-center gap-2">
            <Pill dot size="md">
                {onlineCount} online
            </Pill>
            <button
                ref={bellRef}
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={open === 'notifications'}
                onClick={() => toggle('notifications')}
                className={ROUND_BUTTON}
            >
                <Icon name="bell" size={20} />
                <span
                    aria-hidden="true"
                    className={cn(
                        // content-box as in the mockup: 9px plus the 2px ring = 13px.
                        'absolute right-[10px] top-[9px] box-content h-[9px] w-[9px] rounded-full border-2 border-surface bg-accent',
                        !notifications.hasUnread && 'opacity-0',
                    )}
                />
            </button>
            <button
                ref={accountRef}
                type="button"
                aria-label={`Account menu, ${user.name}`}
                aria-haspopup="menu"
                aria-expanded={open === 'account'}
                onClick={() => toggle('account')}
                className="flex min-h-[44px] items-center gap-[10px] rounded-pill border-1 border-line bg-surface py-1 pl-1 pr-[14px] text-ink"
            >
                <Avatar name={user.name} src={user.avatarUrl} />
                <span className="text-[14px] font-semibold">{user.name}</span>
                <Icon name="chevronDown" size={16} strokeWidth={2} />
            </button>
            <button
                ref={siteRef}
                type="button"
                aria-label="Menu"
                aria-haspopup="menu"
                aria-expanded={open === 'site'}
                onClick={() => toggle('site')}
                className={ROUND_BUTTON}
            >
                <Icon name={open === 'site' ? 'close' : 'menu'} size={20} />
            </button>
            <AccountMenu {...shell('account', accountRef)} user={user} routes={routes} onSignOut={signOut} />
            <SiteMenu {...shell('site', siteRef)} nav={nav} routes={routes} />
            <NotificationsMenu {...shell('notifications', bellRef)} notifications={notifications} />
        </div>
    );
}
