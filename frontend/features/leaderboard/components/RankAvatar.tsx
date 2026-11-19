import { AvatarImage } from '@/components/ui/AvatarImage';
import { cn } from '@/lib/design/cn';

/** Leaderboard.dc.html avatars: table row (40px), podium (56px) and the champion (72px). */
const SIZES = {
    row: { box: 'h-10 w-10 text-[16px]', px: 40 },
    podium: { box: 'h-14 w-14 text-[22px]', px: 56 },
    champion: { box: 'h-[72px] w-[72px] text-[30px]', px: 72 },
} as const;

export type RankAvatarSize = keyof typeof SIZES;

interface RankAvatarProps {
    initial: string;
    src: string | null;
    size: RankAvatarSize;
    /** Gold disc for the number one; otherwise a dark well. */
    gold?: boolean;
}

/** The initial (or photo) in a circle; decorative, the name is printed beside it. */
export function RankAvatar({ initial, src, size, gold = false }: RankAvatarProps) {
    const s = SIZES[size];
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold',
                s.box,
                gold ? 'bg-accent text-on-accent' : 'bg-bg-base text-ink',
                // The champion disc has no ring; every other avatar has a 1.5px ring outside its box.
                size !== 'champion' && 'box-content border-1.5 border-line',
            )}
        >
            {src ? <AvatarImage src={src} size={s.px} /> : initial}
        </span>
    );
}
