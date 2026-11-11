"use client";

import { createContext, useCallback, useContext, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

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

function accentColor(type: ToastType) {
    return type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--accent)';
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
    return (
        <div className="toast-enter pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)] min-w-[260px] max-w-[340px]"
            style={{
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border-strong)',
                borderLeft: `3px solid ${accentColor(t.type)}`,
            }}>
            <span className="shrink-0 mt-0.5">
                {t.type === 'success' && <Check size={15} className="text-green-400" />}
                {t.type === 'error'   && <AlertCircle size={15} className="text-red-400" />}
                {t.type === 'info'    && <Info size={15} className="text-accent" />}
            </span>
            <span className="text-sm leading-snug flex-1" style={{ color: 'var(--text-primary)' }}>{t.message}</span>
            <button onClick={() => onDismiss(t.id)} className="shrink-0 transition-colors mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                <X size={13} />
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
            <div className="fixed bottom-4 right-4 z-[500] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
            </div>
        </ToastContext.Provider>
    );
}
