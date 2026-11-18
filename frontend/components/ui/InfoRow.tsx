import { cn } from '@/lib/design/cn';

interface InfoRowProps {
    label: string;
    value: string;
    /** Long values (e.g. an engine line) wrap instead of overflowing. */
    wrap?: boolean;
}

/**
 * A label / value row with a hairline above it: the "Game info" rows of Game.dc.html (muted
 * label left, mono bold value right). Used for the game info card and the engine readout.
 */
export function InfoRow({ label, value, wrap = false }: InfoRowProps) {
    return (
        <div className="flex items-center justify-between gap-3 border-t-1 border-line-subtle py-[9px] text-[14px]">
            <span className="shrink-0 text-ink-muted">{label}</span>
            <span className={cn('font-mono font-bold', wrap && 'min-w-0 text-right [overflow-wrap:anywhere]')}>
                {value}
            </span>
        </div>
    );
}
