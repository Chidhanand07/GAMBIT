import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/design/cn';
import type { UserSettings } from '../model';
import { choiceValue, type SettingRowDef } from '../rows';

interface SwitchProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

/** The 52×30 switch of Settings.dc.html; an invisible 44px-tall hit area keeps the touch target. */
export function Switch({ label, checked, onChange }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative box-border flex h-[30px] w-[52px] items-center rounded-pill border-1 p-[3px] before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']",
                checked ? 'justify-end border-accent bg-accent' : 'justify-start border-line-muted bg-bg-base',
            )}
        >
            <span className={cn('h-[22px] w-[22px] rounded-full', checked ? 'bg-on-accent' : 'bg-ink')} />
        </button>
    );
}

interface SettingRowProps {
    row: SettingRowDef;
    settings: UserSettings;
    onChange: (key: keyof UserSettings, value: unknown) => void;
}

/** One preference: label and hint on the left, a switch or a segmented choice on the right. */
export function SettingRow({ row, settings, onChange }: SettingRowProps) {
    return (
        <div className="flex flex-wrap items-center gap-4 border-t-1 border-line-subtle px-7 py-[18px]">
            <span className="flex flex-[1_1_240px] flex-col gap-[2px]">
                <span className="font-semibold">{row.label}</span>
                <span className="text-[14px] text-ink-muted">{row.hint}</span>
            </span>
            {row.kind === 'switch' ? (
                <Switch label={row.label} checked={settings[row.key]} onChange={(v) => onChange(row.key, v)} />
            ) : (
                <Tabs
                    label={row.label}
                    tone="accent"
                    items={row.options}
                    value={choiceValue(settings, row.key)}
                    onChange={(id) => onChange(row.key, id)}
                />
            )}
        </div>
    );
}
