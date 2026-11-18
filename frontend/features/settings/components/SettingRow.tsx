import type { ReactNode } from 'react';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import type { AccountPreferences } from '@/types/preferences';
import { rowValue, type AccountRowDef } from '../accountRows';
import type { PreferenceSection } from '../hooks/useAccountPrefsDraft';
import type { UserSettings } from '../model';
import { choiceValue, type SettingRowDef } from '../rows';

/** One preference row: label and hint on the left, its control on the right. */
export function RowShell({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-4 border-t-1 border-line-subtle px-7 py-[18px]">
            <span className="flex flex-[1_1_240px] flex-col gap-[2px]">
                <span className="font-semibold">{label}</span>
                <span className="text-[14px] text-ink-muted">{hint}</span>
            </span>
            {children}
        </div>
    );
}

interface SettingRowProps {
    row: SettingRowDef;
    settings: UserSettings;
    onChange: (key: keyof UserSettings, value: unknown) => void;
}

/** One play preference: a switch or a segmented choice. */
export function SettingRow({ row, settings, onChange }: SettingRowProps) {
    return (
        <RowShell label={row.label} hint={row.hint}>
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
        </RowShell>
    );
}

interface AccountSettingRowProps {
    row: AccountRowDef;
    prefs: AccountPreferences;
    onChange: (section: PreferenceSection, key: string, value: unknown) => void;
}

/** One account preference (Notifications, Privacy, Account): a switch or a segmented choice. */
export function AccountSettingRow({ row, prefs, onChange }: AccountSettingRowProps) {
    const value = rowValue(prefs, row);
    return (
        <RowShell label={row.label} hint={row.hint}>
            {row.kind === 'switch' ? (
                <Switch
                    label={row.label}
                    checked={value === true}
                    onChange={(v) => onChange(row.section, row.key, v)}
                />
            ) : (
                <Tabs
                    label={row.label}
                    tone="accent"
                    items={row.options}
                    value={String(value)}
                    onChange={(id) => onChange(row.section, row.key, id)}
                />
            )}
        </RowShell>
    );
}
