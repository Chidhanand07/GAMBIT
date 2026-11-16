import type { ReactNode } from 'react';
import HoverTrail from '@/components/effects/HoverTrail';

/**
 * The page root every screen sits on (design/HANDOFF.md §2 "Page background"): the four-layer
 * background from Main.dc.html (`.g-page` in app/globals.css) plus the hover trail behind it.
 */
export default function PageBackground({ children }: { children: ReactNode }) {
    return (
        <div className="g-page flex flex-col">
            <HoverTrail />
            {children}
        </div>
    );
}
