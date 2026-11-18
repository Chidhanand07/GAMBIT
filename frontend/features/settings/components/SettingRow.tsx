import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import type { UserSettings } from '../model';
import { choiceValue, type SettingRowDef } from '../rows';

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
