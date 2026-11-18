import { AvatarImage } from '@/components/ui/AvatarImage';
import { cn } from '@/lib/design/cn';

const SIZES = {
    72: 'h-[72px] w-[72px] text-[30px]',
    56: 'h-14 w-14 text-[24px]',
    44: 'h-11 w-11 text-[15px]',
} as const;

/** A round accent avatar: the photo when there is one, else the initial (decorative). */
export function ProfileAvatar({ name, src, size }: { name: string; src: string | null; size: keyof typeof SIZES }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-display font-bold text-on-accent',
                SIZES[size],
            )}
        >
            {src ? <AvatarImage src={src} size={size} /> : (name.charAt(0) || '?').toUpperCase()}
        </span>
    );
}
