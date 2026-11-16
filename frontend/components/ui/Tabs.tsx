import { cn } from '@/lib/design/cn';

export interface TabItem<T extends string> {
    id: T;
    label: string;
}

/** `cream`: Profile section tabs (44px). `accent`: Settings segmented options (36px). */
const TONES = {
    cream: { on: 'bg-ink text-on-accent', size: 'min-h-[44px] px-5 text-[15px]' },
    accent: { on: 'bg-accent text-on-accent', size: 'min-h-[36px] px-[14px] text-[14px]' },
} as const;

interface TabsProps<T extends string> {
    /** Accessible name of the group. */
    label: string;
    items: readonly TabItem<T>[];
    value: T;
    onChange: (id: T) => void;
    tone?: keyof typeof TONES;
    className?: string;
}

/** A pill-track switcher of `aria-pressed` buttons, as in Profile.dc.html and Settings.dc.html. */
export function Tabs<T extends string>({ label, items, value, onChange, tone = 'cream', className }: TabsProps<T>) {
    const t = TONES[tone];
    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                'flex flex-wrap gap-1 rounded-pill border-1 border-line-subtle bg-surface-inset p-1',
                className,
            )}
        >
            {items.map((item) => {
                const on = item.id === value;
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(item.id)}
                        className={cn(
                            'rounded-pill border-0 font-semibold',
                            t.size,
                            on ? t.on : 'bg-transparent text-ink',
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
