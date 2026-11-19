// Copy and links of the landing page (design/Home.dc.html).
import type { IconName } from '@/components/ui/Icon';
import { TIME_CONTROL_PRESETS } from '@/lib/chess/timeControl';
import type { Viewer } from '@/types/viewer';

export interface LandingFeature {
    icon: IconName;
    title: string;
    body: string;
}

export const FEATURES: readonly LandingFeature[] = [
    {
        icon: 'bolt',
        title: 'Bullet Games',
        body: 'Sub-second reactions. Pure instinct. 1+0 bullet with server-authoritative clocks.',
    },
    {
        icon: 'chart',
        title: 'Accuracy Rating',
        body: 'Depth-18 Stockfish centipawn loss classification after every game you play.',
    },
    {
        icon: 'users',
        title: 'Play Friends',
        body: 'Invite links and private rooms. Share a link, start playing in seconds.',
    },
    {
        icon: 'trophy',
        title: 'Leaderboards',
        body: 'Glicko-2 rated per time control. Bullet, blitz, rapid, and classical tracked separately.',
    },
    {
        icon: 'shield',
        title: 'Full Rules',
        body: 'Castling, en passant, promotion. All edge cases handled by server-side chess.js.',
    },
    {
        icon: 'globe',
        title: 'Play Anywhere',
        body: 'Fully responsive down to 375px. Tap to select, tap to move on any device.',
    },
];

/** Time controls a player can pick in the lobby: the shared presets plus Custom. */
export const TIME_CONTROL_COUNT = Object.keys(TIME_CONTROL_PRESETS).length + 1;

export interface HeroStat {
    value: string;
    label: string;
}

/**
 * Hero claims (F-110): each is literally true. No game cap exists, the count is read from the real
 * presets, and nothing in the app is paid.
 */
export const HERO_STATS: readonly HeroStat[] = [
    { value: '∞', label: 'games available' },
    { value: String(TIME_CONTROL_COUNT), label: 'time controls' },
    { value: 'Free', label: 'always' },
];

export interface HeroCta {
    label: string;
    href: string;
}

export const LANDING_ROUTES = { play: '/lobby', signUp: '/signup' } as const;

/**
 * The hero buttons for this viewer (F-110). Play always goes to the lobby (the proxy sends a guest
 * to sign in first). The second button signs a guest up; a signed-in player gets "My Profile"
 * instead, and a viewer whose profile could not be read gets no second button.
 */
export function heroCtas(viewer: Viewer): { primary: HeroCta; secondary: HeroCta | null } {
    const primary = { label: 'Play Now', href: LANDING_ROUTES.play };
    if (viewer.status === 'guest')
        return { primary, secondary: { label: 'Create Account', href: LANDING_ROUTES.signUp } };
    if (viewer.status === 'unknown') return { primary, secondary: null };
    return {
        primary,
        secondary: { label: 'My Profile', href: `/profile/${encodeURIComponent(viewer.profile.username)}` },
    };
}

export const FOOTER_LINKS: readonly { label: string; href: string }[] = [
    { label: 'Play', href: '/lobby' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Analysis', href: '/analysis' },
    { label: 'Offline', href: '/offline' },
];

/** The hero board: the King's Gambit after 4. h4 (h2–h4 highlighted as the last move). */
export const HERO_POSITION = {
    fen: 'rnbqkbnr/pppp1p1p/8/6p1/4Pp1P/5N2/PPPP2P1/RNBQKB1R',
    lastMove: { from: 'h2', to: 'h4' },
    label: "King's Gambit position after 4. h4",
    caption: "King's Gambit · 1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4",
} as const;
