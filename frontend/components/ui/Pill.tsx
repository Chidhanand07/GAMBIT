import type { ReactNode } from 'react';
import { cn } from '@/lib/design/cn';

export type PillTone = 'success' | 'neutral';

/** "1 online" / "Online" / "Rated" (success) and profile chips such as "India" (neutral). */
const TONES: Record<PillTone, string> = {
    success: 'bg-success-bg text-success-ink',
    neutral: 'box-content border-1 border-line bg-bg-base text-ink',
};

interface PillProps {
    tone?: PillTone;
    /** Leading status dot (the online indicator). */
    dot?: boolean;
    /** Dot colour: green (online) or gold (the landing "Free to play" badge). */
    dotTone?: 'success' | 'accent';
    /** `md` is 32px tall (header), `sm` 28px (profile). */
    size?: 'sm' | 'md';
    className?: string;
    children: ReactNode;
}

export function Pill({ tone = 'success', dot = false, dotTone = 'success', size = 'sm', className, children }: PillProps) {
    return (
        <span
            className={cn(
                'flex items-center gap-2 rounded-pill px-3 text-[13px] font-semibold',
                size === 'md' ? 'min-h-[32px]' : 'min-h-[28px]',
                TONES[tone],
                className,
            )}
        >
            {dot && (
                <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 rounded-full', dotTone === 'accent' ? 'bg-accent' : 'bg-success')}
                />
            )}
            {children}
        </span>
    );
}
