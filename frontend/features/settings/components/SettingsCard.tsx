import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

interface SettingsCardProps {
    title: string;
    subtitle: string;
    children: ReactNode;
}

/** A settings section: heading and subtitle, then fields, rows and the save bar. */
export function SettingsCard({ title, subtitle, children }: SettingsCardProps) {
    return (
        <Card className="overflow-hidden p-0">
            <div className="px-7 pb-2 pt-[22px]">
                <h2 className="m-0 font-display text-[22px] font-semibold leading-[1.5] tracking-normal">{title}</h2>
                <p className="mb-0 mt-1 text-[15px] text-ink-muted">{subtitle}</p>
            </div>
            {children}
        </Card>
    );
}

interface SaveBarProps {
    onSave: () => void;
    onReset: () => void;
    saving?: boolean;
    /** "Changes saved." / "Defaults restored." */
    status: string;
    error?: string;
}

/** "Save changes", "Reset to defaults" and the status line. */
export function SaveBar({ onSave, onReset, saving = false, status, error }: SaveBarProps) {
    return (
        <div className="flex flex-wrap items-center gap-3 border-t-1 border-line px-7 py-5">
            <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="min-h-[52px] rounded-pill border-0 bg-accent px-7 text-[16px] font-bold text-on-accent disabled:opacity-60"
            >
                Save changes
            </button>
            <button
                type="button"
                onClick={onReset}
                className="min-h-[52px] border-0 bg-transparent px-5 text-[16px] font-semibold text-ink"
            >
                Reset to defaults
            </button>
            <span role="status" className="text-[14px] font-semibold text-success-ink">
                {saving ? 'Saving…' : status}
            </span>
            {error && (
                <span role="alert" className="text-[14px] font-semibold text-danger">
                    {error}
                </span>
            )}
        </div>
    );
}
