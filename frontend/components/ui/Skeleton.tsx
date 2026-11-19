import { cn } from '@/lib/design/cn';

/**
 * A placeholder block while a page's data loads: the card surface, pulsing only when motion is
 * allowed. Size and radius come from `className`.
 */
export function Skeleton({ className }: { className?: string }) {
    return <span aria-hidden="true" className={cn('block bg-surface motion-safe:animate-pulse', className)} />;
}
