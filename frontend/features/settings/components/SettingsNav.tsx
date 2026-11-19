import { cn } from '@/lib/design/cn';

export type SettingsSection = 'profile' | 'board' | 'gameplay' | 'account';

export const SECTIONS: { id: SettingsSection; label: string }[] = [
    { id: 'profile', label: 'Public profile' },
    { id: 'board', label: 'Board & pieces' },
    { id: 'gameplay', label: 'Gameplay' },
    { id: 'account', label: 'Account' },
];

/** The left column of section buttons (`aria-pressed`), as in Settings.dc.html. */
export function SettingsNav({ value, onChange }: { value: SettingsSection; onChange: (s: SettingsSection) => void }) {
    return (
        <div role="group" aria-label="Settings sections" className="flex min-w-[180px] flex-[0_1_220px] flex-col gap-1">
            {SECTIONS.map((s) => {
                const on = s.id === value;
                return (
                    <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(s.id)}
                        className={cn(
                            'min-h-[48px] rounded-14 border-0 px-4 text-left text-[16px] font-semibold',
                            on ? 'bg-ink text-on-accent' : 'bg-transparent text-ink',
                        )}
                    >
                        {s.label}
                    </button>
                );
            })}
        </div>
    );
}
