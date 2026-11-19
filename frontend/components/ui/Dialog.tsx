'use client';

import { useRef, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';
import { useFocusTrap } from './useFocusTrap';

export type DialogTone = 'accent' | 'danger';

const TONES: Record<DialogTone, { border: string; badge: string }> = {
    accent: { border: 'border-accent', badge: 'border-accent text-accent' },
    danger: { border: 'border-danger', badge: 'border-danger text-danger' },
};

interface DialogProps {
    open: boolean;
    /** Escape, a click on the backdrop, or a cancel action. */
    onClose: () => void;
    title: string;
    description?: ReactNode;
    /** Path data for the round badge icon above the title. */
    iconPath?: string;
    tone?: DialogTone;
    /** `alertdialog` for confirmations (Draw / Resign), `dialog` otherwise. */
    role?: 'dialog' | 'alertdialog';
    /** The action buttons, stacked full width. */
    children?: ReactNode;
}

/** A centred modal (Game.dc.html confirmation): focus-trapped, Esc closes, focus is restored. */
export function Dialog({
    open,
    onClose,
    title,
    description,
    iconPath,
    tone = 'accent',
    role = 'dialog',
    children,
}: DialogProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    useFocusTrap(panelRef, open, onClose);
    if (!open) return null;
    const t = TONES[tone];
    return (
        <div className="fixed inset-0 z-50 box-border flex items-center justify-center p-6">
            <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
            <div
                ref={panelRef}
                role={role}
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className={cn(
                    'relative box-border flex w-[min(420px,100%)] flex-col items-center gap-[14px] rounded-24 border-1 bg-surface-header p-7 text-center text-ink shadow-dialog',
                    t.border,
                )}
            >
                {iconPath && (
                    <span
                        aria-hidden="true"
                        className={cn(
                            'box-content flex h-14 w-14 items-center justify-center rounded-full border-1.5 bg-bg-base',
                            t.badge,
                        )}
                    >
                        <Icon path={iconPath} size={26} />
                    </span>
                )}
                <span className="font-display text-[22px] font-bold">{title}</span>
                {description && <span className="text-[15px] text-ink-muted">{description}</span>}
                {children && <div className="flex w-full flex-col gap-2 pt-[6px]">{children}</div>}
            </div>
        </div>
    );
}
