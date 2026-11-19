import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';

export type NavKey = 'play' | 'leaderboard' | 'analysis';

export interface NavPillLink {
    key: NavKey;
    href: string;
    label: string;
}

/**
 * How the pill rests when no link is current: `idle` hides it until a link is hovered or
 * focused (Profile, Settings); `none` hides it until the nav is hovered (landing, auth).
 */
export type NavPillRest = 'idle' | 'none';

interface NavPillProps {
    links: readonly NavPillLink[];
    /** The page's own section; the pill sits under it. */
    current: NavKey | null;
    rest?: NavPillRest;
}

/** Slot class (width, :has() target), nav class (pill resting place) and icon per link. */
const SLOTS: Record<NavKey, { link: string; nav: string; icon: IconName }> = {
    play: { link: 'gl1', nav: '', icon: 'play' },
    leaderboard: { link: 'gl2', nav: 'gpos2', icon: 'trophy' },
    analysis: { link: 'gl3', nav: 'gpos3', icon: 'chart' },
};

/**
 * The cream pill that slides under the current link and, on hover or focus, under another one.
 * The motion is CSS only: `.gnav:has(.glN:hover) .gpill` in app/globals.css (HANDOFF §4.2).
 */
export function NavPill({ links, current, rest = 'idle' }: NavPillProps) {
    const navClass = current ? SLOTS[current].nav : rest === 'idle' ? 'gidle' : 'gnone';
    return (
        <nav
            aria-label="Main"
            className={cn(
                'gnav relative mx-auto flex items-center rounded-pill border-1 border-line-subtle bg-surface-inset p-1',
                navClass,
            )}
        >
            <span aria-hidden="true" className="gpill" />
            {links.map((link) => {
                const isCurrent = link.key === current;
                return (
                    <Link
                        key={link.key}
                        href={link.href}
                        aria-current={isCurrent ? 'page' : undefined}
                        className={cn(
                            'gl relative z-[1] box-border flex min-h-[44px] items-center justify-center gap-2 rounded-pill font-semibold no-underline',
                            SLOTS[link.key].link,
                            isCurrent ? 'gcur text-on-accent hover:text-on-accent' : 'text-ink hover:text-ink',
                        )}
                    >
                        <Icon name={SLOTS[link.key].icon} />
                        {link.label}
                    </Link>
                );
            })}
        </nav>
    );
}
