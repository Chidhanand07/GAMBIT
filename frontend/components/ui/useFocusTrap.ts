'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Keeps Tab / Shift+Tab inside `container`, wrapping at both ends. */
function wrapTab(e: KeyboardEvent, container: HTMLElement) {
    const items = focusables(container);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
    }
}

/**
 * While `open`: moves focus into `containerRef`, traps Tab inside it and calls `onClose` on
 * Escape. On close (or unmount) focus returns to whatever had it before opening.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!open || !container) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        (focusables(container)[0] ?? container).focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCloseRef.current();
            } else if (e.key === 'Tab') wrapTab(e, container);
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            previous?.focus();
        };
    }, [containerRef, open]);
}
