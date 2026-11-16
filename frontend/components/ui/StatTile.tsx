import { cn } from '@/lib/design/cn';

export type StatTone = 'ink' | 'success' | 'danger' | 'muted' | 'accent';

const TONES: Record<StatTone, string> = {
    ink: 'text-ink',
    success: 'text-success',
    danger: 'text-danger',
    muted: 'text-ink-muted',
    accent: 'text-accent',
};

interface StatTileProps {
    value: string;
    label: string;
    tone?: StatTone;
    className?: string;
}

/** A centred number over its label (Profile.dc.html, Stats tab totals). */
export function StatTile({ value, label, tone = 'ink', className }: StatTileProps) {
    return (
        <div
            className={cn(
                'box-border flex flex-col gap-1 rounded-20 border-1 border-line bg-surface p-5 text-center',
                className,
            )}
        >
            <span className={cn('font-mono text-[36px] font-bold', TONES[tone])}>{value}</span>
            <span className="text-[14px] text-ink-muted">{label}</span>
        </div>
    );
}
