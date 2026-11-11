export const NAV_LINKS = [
    { href: '/lobby', label: 'Play' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/analysis', label: 'Analysis' },
];

/** A link is active on its own path and on any nested path. */
export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');
