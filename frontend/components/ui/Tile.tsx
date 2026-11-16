import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';

interface TileProps {
    /** Path data for the 24×24 icon. */
    iconPath: string;
    title: string;
    blurb: string;
    selected: boolean;
    onSelect: () => void;
    /** `clock`: the tall 1/3/10/30 min tiles. `wide`: Custom and Daily. */
    variant?: 'clock' | 'wide';
    /** Clock tiles: the big number and its unit ("3", "min"). */
    value?: string;
    unit?: string;
    /** Clock tiles: a badge such as "Popular". */
    badge?: string;
    /** Wide tiles: the right-hand note, e.g. "1 day/move". */
    meta?: string;
    className?: string;
}

/** Selected tiles turn gold (Main.dc.html `look()`); hover lift and icon spin come from `.tile`. */
function palette(selected: boolean) {
    return selected
        ? { box: 'border-accent bg-accent text-on-accent', sub: 'text-on-accent-muted', icon: 'text-on-accent' }
        : { box: 'border-line bg-surface text-ink', sub: 'text-ink-muted', icon: 'text-accent' };
}

function ClockBody({ selected, iconPath, badge, value, unit, title, blurb }: TileProps) {
    const p = palette(selected);
    return (
        <>
            <span className="flex min-h-[28px] items-center justify-between gap-2">
                <Icon path={iconPath} size={24} className={p.icon} />
                {badge && (
                    <span
                        className={cn(
                            'rounded-pill px-[10px] py-1 text-[12px] font-semibold',
                            selected ? 'bg-on-accent text-ink' : 'bg-accent text-on-accent',
                        )}
                    >
                        {badge}
                    </span>
                )}
            </span>
            <span className="mt-auto flex items-baseline gap-[6px]">
                <span className="tn font-mono text-[72px] font-bold leading-none tracking-[-0.04em]">{value}</span>
                <span className={cn('font-mono text-[16px] font-medium', p.sub)}>{unit}</span>
            </span>
            <span className="font-display text-[20px] font-semibold tracking-[-0.01em]">{title}</span>
            <span className={cn('text-[14px]', p.sub)}>{blurb}</span>
        </>
    );
}

function WideBody({ selected, iconPath, title, blurb, meta }: TileProps) {
    const p = palette(selected);
    return (
        <>
            <Icon path={iconPath} size={24} className={cn('shrink-0', p.icon)} />
            <span className="flex min-w-0 flex-grow flex-col">
                <span className="font-display text-[18px] font-semibold">{title}</span>
                <span className={cn('text-[14px]', p.sub)}>{blurb}</span>
            </span>
            <span className={cn('whitespace-nowrap font-mono text-[13px] font-medium', p.sub)}>{meta}</span>
        </>
    );
}

/** A time-control tile: an `aria-pressed` button (Main.dc.html). */
export function Tile(props: TileProps) {
    const { variant = 'clock', selected, onSelect, className } = props;
    const wide = variant === 'wide';
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            className={cn(
                'tile box-border flex min-w-0 border-1.5 text-left',
                wide
                    ? 'min-h-[76px] flex-[1_1_280px] items-center gap-4 rounded-16 px-5 py-[14px]'
                    : 'min-h-[216px] flex-[1_1_180px] flex-col gap-1 rounded-20 p-5',
                palette(selected).box,
                className,
            )}
        >
            {wide ? <WideBody {...props} /> : <ClockBody {...props} />}
        </button>
    );
}
