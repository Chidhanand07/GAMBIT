"use client";

import { createContext, useCallback, useContext, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string; }
interface ToastContextValue { toast: (message: string, type?: ToastType) => void; }

const TOAST_LIFETIME_MS = 4000;

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

let _counter = 0;

/** State updater that drops the toast with `id`. */
function withoutToast(id: number) {
    return (prev: Toast[]) => prev.filter(t => t.id !== id);
}

/** Stroked icons in the design's style (24×24, Lucide paths as in the mockups). */
const TOAST_ICONS: Record<ToastType, string> = {
    success: 'M20 6 9 17l-5-5',
    error: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
};

/** The left rule and icon colour per type. */
const TONES: Record<ToastType, { rule: string; icon: string }> = {
    success: { rule: 'border-l-success', icon: 'text-success' },
    error: { rule: 'border-l-danger', icon: 'text-danger' },
    info: { rule: 'border-l-accent', icon: 'text-accent' },
};

/**
 * One toast. No mockup has toasts, so it uses the header popover's surface (as ChallengeToast
 * does) with a coloured left rule; errors are announced as alerts.
 */
function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
    const tone = TONES[t.type];
    return (
        <div
            role={t.type === 'error' ? 'alert' : 'status'}
            className={cn(
                'g-toast-in pointer-events-auto box-border flex min-w-[260px] max-w-[340px] items-start gap-3 rounded-16 border-1 border-l-[3px] border-line bg-surface-header py-3 pl-4 pr-2 text-ink shadow-popover',
                tone.rule,
            )}
        >
            <Icon path={TOAST_ICONS[t.type]} size={16} className={cn('mt-[3px] shrink-0', tone.icon)} />
            <span className="flex-1 text-[14px] leading-snug">{t.message}</span>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss(t.id)}
                className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-ink-muted"
            >
                <Icon name="close" size={14} />
            </button>
        </div>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++_counter;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(withoutToast(id)), TOAST_LIFETIME_MS);
    }, []);

    const dismiss = (id: number) => setToasts(withoutToast(id));

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[500] flex max-w-[calc(100vw-32px)] flex-col gap-2">
                {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
            </div>
        </ToastContext.Provider>
    );
}
