'use client';

import Link from 'next/link';
import { LogoTile } from '@/components/ui/KnightMark';
import { HeaderAccount } from './HeaderAccount';
import type { HeaderNav, HeaderRoutes, HeaderSession } from './headerTypes';
import { NavPill } from './NavPill';

function HeaderLogo({ href }: { href: string }) {
    return (
        <Link href={href} className="flex min-h-[44px] items-center gap-3 text-ink no-underline hover:text-ink">
            <LogoTile />
            <span className="flex flex-col leading-[1.1]">
                <span className="font-display text-[22px] font-bold tracking-[-0.02em]">Gambit</span>
                <span className="text-[12px] font-medium text-ink-muted">Chess, perfected.</span>
            </span>
        </Link>
    );
}

/** Signed-out actions (Signin.dc.html header). */
function GuestActions({ routes }: { routes: HeaderRoutes }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Link
                href={routes.signIn}
                className="flex min-h-[44px] items-center rounded-pill px-4 font-semibold no-underline"
            >
                Sign in
            </Link>
            <Link
                href={routes.signUp}
                className="gb-flat flex min-h-[44px] items-center rounded-pill bg-accent px-5 font-semibold text-on-accent no-underline hover:text-on-accent"
            >
                Create account
            </Link>
        </div>
    );
}

interface AppHeaderProps {
    nav: HeaderNav;
    routes: HeaderRoutes;
    session: HeaderSession;
    onlineCount: number;
}

/** The floating header bar shared by every screen (design/Main.dc.html and siblings). */
export function AppHeader({ nav, routes, session, onlineCount }: AppHeaderProps) {
    return (
        <header className="box-border px-8 pt-4">
            <div className="mx-auto box-border flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-[10px] rounded-24 border-1 border-line bg-surface-header py-[10px] pl-[14px] pr-3 shadow-header">
                <HeaderLogo href={routes.home} />
                <NavPill links={nav.links} current={nav.current} rest={nav.rest} />
                {session.status === 'loading' && (
                    <div
                        role="status"
                        aria-label="Loading account"
                        className="h-11 w-[160px] rounded-pill border-1 border-line bg-surface motion-safe:animate-pulse"
                    />
                )}
                {session.status === 'guest' && <GuestActions routes={routes} />}
                {session.status === 'signed-in' && (
                    <HeaderAccount
                        user={session.user}
                        notifications={session.notifications}
                        onSignOut={session.onSignOut}
                        onlineCount={onlineCount}
                        nav={nav}
                        routes={routes}
                    />
                )}
            </div>
        </header>
    );
}
