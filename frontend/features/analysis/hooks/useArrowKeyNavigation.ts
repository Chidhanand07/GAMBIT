'use client';

import { useEffect } from 'react';

export type NavigationStep = -1 | 1;

/**
 * ArrowLeft / ArrowRight report a step of -1 / +1 (ignored while typing in an
 * input or textarea). The caller moves the cursor; this hook owns no state, so
 * no state setter runs inside another setter's updater (F14).
 */
export function useArrowKeyNavigation(onStep: (delta: NavigationStep) => void) {
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onStep(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onStep(1);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onStep]);
}
