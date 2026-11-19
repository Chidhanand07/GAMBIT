'use client';

import { useEffect, useRef } from 'react';
import { attachHoverTrail } from '@/lib/design/hoverTrail';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A pointer that can hover (mouse, trackpad). Touch screens have nothing to trace (F-111). */
const HOVER_POINTER = '(hover: hover) and (pointer: fine)';

const matches = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
const prefersReducedMotion = () => matches(REDUCED_MOTION);
const canHover = () => typeof window.matchMedia !== 'function' || matches(HOVER_POINTER);

/**
 * The background hover trail (design/HANDOFF.md §4.1): an 80px cell grid behind all content,
 * a highlight on the cell under the pointer and a fading trace for each cell it leaves. It must
 * be a direct child of the page root (`.g-page`), whose pointer it tracks. Off under reduced motion
 * and on touch-only devices, where no cells are built at all.
 */
export default function HoverTrail() {
    const gridRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const grid = gridRef.current;
        const highlight = highlightRef.current;
        const root = grid?.parentElement;
        if (!grid || !highlight || !root || prefersReducedMotion() || !canHover()) return;
        return attachHoverTrail({ root, grid, highlight });
    }, []);

    return (
        <>
            <div ref={gridRef} aria-hidden="true" className="g-trail" />
            <span ref={highlightRef} aria-hidden="true" className="ghl" />
        </>
    );
}
