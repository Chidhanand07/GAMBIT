import { AvatarImage } from '@/components/ui/AvatarImage';
import { cn } from '@/lib/design/cn';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarTone = 'accent' | 'surface';
export type AvatarStatus = 'online' | 'away' | 'offline';

/** Box, type size and status-dot size per avatar size: 36 / 40 / 52 / 96px. */
const SIZES: Record<AvatarSize, { box: string; px: number; dot: string }> = {
    sm: { box: 'h-9 w-9 text-[15px]', px: 36, dot: 'h-[11px] w-[11px] border-2' },
    md: { box: 'h-10 w-10 text-[16px]', px: 40, dot: 'h-[11px] w-[11px] border-2' },
    lg: { box: 'h-[52px] w-[52px] text-[22px]', px: 52, dot: 'h-[13px] w-[13px] border-[2.5px]' },
    xl: { box: 'h-24 w-24 text-[42px]', px: 96, dot: 'h-[13px] w-[13px] border-[2.5px]' },
};

const TONES: Record<AvatarTone, string> = {
    accent: 'bg-accent font-display text-on-accent',
    surface: 'box-content border-1.5 border-line bg-surface text-accent',
};

const STATUS: Record<AvatarStatus, string> = {
    online: 'bg-success',
    away: 'bg-accent',
    offline: 'bg-ink-disabled',
};

interface AvatarProps {
    /** Display name; its first letter is the fallback when there is no photo. */
    name: string;
    src?: string | null;
    size?: AvatarSize;
    tone?: AvatarTone;
    status?: AvatarStatus;
    /** The profile hero's double ring (bg-base gap, then accent). */
    ring?: boolean;
    className?: string;
}

/** A round avatar: the photo when there is one, else the initial (decorative: `aria-hidden`). */
export function Avatar({ name, src, size = 'sm', tone = 'accent', status, ring = false, className }: AvatarProps) {
    const s = SIZES[size];
    return (
        <span
            aria-hidden="true"
            className={cn(
                'relative flex shrink-0 items-center justify-center rounded-full font-bold',
                s.box,
                TONES[tone],
                ring && 'shadow-avatar-ring',
                className,
            )}
        >
            {src ? (
                <span className="h-full w-full overflow-hidden rounded-full">
                    <AvatarImage src={src} size={s.px} />
                </span>
            ) : (
                (name.charAt(0) || '?').toUpperCase()
            )}
            {status && (
                <span
                    className={cn(
                        'absolute -bottom-[2px] -right-[2px] box-content rounded-full border-bg-base',
                        s.dot,
                        STATUS[status],
                    )}
                />
            )}
        </span>
    );
}
