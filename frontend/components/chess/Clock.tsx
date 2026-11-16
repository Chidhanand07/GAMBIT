import { cn } from '@/lib/design/cn';
import { formatClock } from '@/lib/chess/clock';

interface ClockProps {
    /** Remaining seconds (server clock state). */
    seconds: number;
    /** This side is to move. */
    active: boolean;
    /** Under the low-time threshold (see isClockLow): coral. */
    low?: boolean;
    /** Accessible name, e.g. "Your clock". */
    label: string;
    className?: string;
}

/** The player-bar clock (Game.dc.html): gold while running, coral when low, else surface. */
export function Clock({ seconds, active, low = false, label, className }: ClockProps) {
    const tone = low ? 'bg-danger text-on-accent' : active ? 'bg-accent text-on-accent' : 'bg-surface text-ink';
    return (
        <span
            role="timer"
            aria-label={label}
            data-active={active}
            className={cn('rounded-12 px-4 py-2 font-mono text-[26px] font-bold tracking-[-0.02em]', tone, className)}
        >
            {formatClock(seconds)}
        </span>
    );
}
