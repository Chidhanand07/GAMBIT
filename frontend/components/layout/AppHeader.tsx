'use client';

import Link from 'next/link';
import { HeaderAccount } from './HeaderAccount';
import type { HeaderNav, HeaderRoutes, HeaderSession } from './headerTypes';
import { NavPill } from './NavPill';

/** The knight logo tile: the knight path from Main.dc.html (also the Piece knight). */
function LogoMark() {
    return (
        <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-12 bg-accent text-on-accent"
        >
            <svg aria-hidden="true" width="26" height="26" viewBox="10 8 44 52">
                <g transform="translate(1.8 0)">
                    <path
                        d="M23 50C22 44 24 39 29.500 35L24 37.600C22.800 38 21.400 37.600 20.600 36.700L13.500 30.200C12.800 29.400 13 28.200 14 27.600L23.200 22.600C24 21.600 24.300 20.400 24.800 19L25.200 10.800L30.200 16.200C31.800 15.200 33.600 14.800 35.500 14.800C43 15.500 47.500 23.500 47 32C46.700 38 45 44 43.500 50Z"
                        className="fill-on-accent"
                    />
                    <circle cx="27.200" cy="23.800" r="1.800" className="fill-accent" />
                </g>
                <rect x="17.500" y="50.500" width="29" height="3.200" rx="1.600" className="fill-on-accent" />
                <rect x="13.500" y="54" width="37" height="5" rx="2.200" className="fill-on-accent" />
            </svg>
        </span>
    );
}

function HeaderLogo({ href }: { href: string }) {
    return (
        <Link href={href} className="flex min-h-[44px] items-center gap-3 text-ink no-underline hover:text-ink">
            <LogoMark />
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
