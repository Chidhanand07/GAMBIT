import type { HeaderNav, HeaderRoutes } from '@/components/layout/headerTypes';
import type { NavPillLink } from '@/components/layout/NavPill';

export const NAV_LINKS: readonly NavPillLink[] = [
    { key: 'play', href: '/lobby', label: 'Play' },
    { key: 'leaderboard', href: '/leaderboard', label: 'Leaderboard' },
    { key: 'analysis', href: '/analysis', label: 'Analysis' },
];

export const HEADER_ROUTES: HeaderRoutes = {
    home: '/',
    signIn: '/login',
    signUp: '/signup',
    leaderboard: '/leaderboard',
    settings: '/settings',
};

/** Landing and auth screens, where the nav pill stays hidden until the nav is hovered (`gnone`). */
const PILL_HIDDEN_PATHS = ['/', '/login', '/signup', '/reset-password'];

/** A link is active on its own path and on any nested path. */
export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

/** The nav pill for `pathname`: under the current section, else resting hidden (idle or none). */
export function navStateFor(pathname: string): HeaderNav {
    const current = NAV_LINKS.find((link) => isActivePath(pathname, link.href));
    return {
        links: NAV_LINKS,
        current: current?.key ?? null,
        rest: PILL_HIDDEN_PATHS.includes(pathname) ? 'none' : 'idle',
    };
}

/** The live game screen (`/game/<id>`, not its result page): Game.dc.html has no app header. */
const HEADERLESS_PATH = /^\/game\/[^/]+\/?$/;

/** The landing renders its own header, seeded with the viewer it resolved on the server (F-112). */
const OWN_HEADER_PATHS = ['/'];

/** True where the root layout must not render the app header. */
export const hidesAppHeader = (pathname: string) =>
    HEADERLESS_PATH.test(pathname) || OWN_HEADER_PATHS.includes(pathname);
