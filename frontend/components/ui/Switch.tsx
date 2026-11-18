import { cn } from '@/lib/design/cn';

interface SwitchProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** While the real state is unknown (e.g. two-factor still loading). */
    disabled?: boolean;
}

/** The 52×30 switch of Settings.dc.html; an invisible 44px-tall hit area keeps the touch target. */
export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative box-border flex h-[30px] w-[52px] shrink-0 items-center rounded-pill border-1 p-[3px] before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] disabled:opacity-60",
                checked ? 'justify-end border-accent bg-accent' : 'justify-start border-line-muted bg-bg-base',
            )}
        >
            <span className={cn('h-[22px] w-[22px] rounded-full', checked ? 'bg-on-accent' : 'bg-ink')} />
        </button>
    );
}
