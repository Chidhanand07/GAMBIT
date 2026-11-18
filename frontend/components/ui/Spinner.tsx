import { cn } from '@/lib/design/cn';

const SIZES = { sm: 'h-4 w-4', md: 'h-8 w-8' } as const;

interface SpinnerProps {
    /** Accessible name; leave out when the surrounding text already says what is loading. */
    label?: string;
    size?: keyof typeof SIZES;
    className?: string;
}

/**
 * A loading ring in the design's colours (line track, gold arc). It spins only when motion is
 * allowed; with `prefers-reduced-motion` it is a still ring.
 */
export function Spinner({ label, size = 'md', className }: SpinnerProps) {
    return (
        <span
            role={label ? 'status' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            className={cn(
                'inline-block shrink-0 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin',
                SIZES[size],
                className,
            )}
        />
    );
}
