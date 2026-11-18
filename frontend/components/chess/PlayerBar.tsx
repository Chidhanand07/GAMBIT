import type { ReactNode } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/design/cn';

interface PlayerBarProps {
    name: string;
    /** Links the name (e.g. to the player's profile). */
    nameHref?: string | null;
    /** A chip after the rating, e.g. "You" on the viewer's own bar. */
    badge?: string | null;
    rating?: string | null;
    /** Short country code chip, e.g. "IN". */
    country?: string | null;
    side: 'white' | 'black';
    avatarUrl?: string | null;
    online?: boolean;
    /** This player is to move: gold ring. */
    active: boolean;
    /** Captured-piece glyphs and material lead, e.g. "♟♟ +2". */
    captures?: string;
    /** Remaining time as a percentage, for the draining bar. */
    timePercent?: number;
    low?: boolean;
    /** Usually a <Clock/>. */
    clock?: ReactNode;
    className?: string;
}

const chip = 'rounded-pill px-2 py-[2px] font-mono font-bold text-ink-muted';

function PlayerName({ name, href }: { name: string; href?: string | null }) {
    if (!href) return <span className="text-[18px] font-bold">{name}</span>;
    return (
        <Link href={href} className="text-[18px] font-bold no-underline">
            {name}
        </Link>
    );
}

/** A player row above or below the board (Game.dc.html). */
export function PlayerBar(props: PlayerBarProps) {
    const { name, nameHref, badge, rating, country, side, avatarUrl, online = true, active } = props;
    const { captures, timePercent, low, clock } = props;
    const ring = active ? 'border-accent' : 'border-line-subtle';
    return (
        <div
            className={cn(
                'flex items-center gap-[14px] rounded-16 border-1.5 bg-bg-base px-[14px] py-[10px]',
                ring,
                props.className,
            )}
        >
            <Avatar
                name={name}
                src={avatarUrl}
                size="lg"
                tone="surface"
                status={online ? 'online' : undefined}
                className={cn('border-2', ring)}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="flex flex-wrap items-center gap-2">
                    <PlayerName name={name} href={nameHref} />
                    {rating && <span className={cn(chip, 'bg-surface text-[12px]')}>{rating}</span>}
                    {country && <span className={cn(chip, 'border-1 border-line text-[11px]')}>{country}</span>}
                    {badge && <span className={cn(chip, 'border-1 border-line text-[11px]')}>{badge}</span>}
                    <span
                        aria-hidden="true"
                        className={cn(
                            'box-content h-3 w-3 rounded-3 border-1 border-line-muted',
                            side === 'white' ? 'bg-ink' : 'bg-on-accent',
                        )}
                    />
                </span>
                <span className="min-h-[22px] font-symbols text-[16px] text-ink">{captures}</span>
                {timePercent !== undefined && (
                    <span aria-hidden="true" className="block h-[5px] overflow-hidden rounded-pill bg-surface">
                        <span
                            className={cn(
                                'block h-full rounded-pill motion-safe:transition-[width] motion-safe:duration-400 motion-safe:ease-[ease]',
                                low ? 'bg-danger' : 'bg-accent',
                            )}
                            style={{ width: `${timePercent}%` }}
                        />
                    </span>
                )}
            </span>
            {clock}
        </div>
    );
}
