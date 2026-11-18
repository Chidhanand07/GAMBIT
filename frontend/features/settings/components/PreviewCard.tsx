import type { ReactNode } from 'react';

/** The aside card with the gold "Live preview" eyebrow. */
export function PreviewCard({ children }: { children: ReactNode }) {
    return (
        <div className="box-border flex flex-col gap-[14px] rounded-20 border-1 border-line bg-surface-header p-5">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">Live preview</span>
            {children}
        </div>
    );
}

/** A 26px chip of the profile preview. */
export function PreviewChip({ children }: { children: ReactNode }) {
    return (
        <span className="flex min-h-[26px] items-center rounded-pill border-1 border-line bg-bg-base px-[10px] text-[12px] font-semibold">
            {children}
        </span>
    );
}
