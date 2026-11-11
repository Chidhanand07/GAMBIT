import type { MouseEvent } from 'react';

type HoverStyle = Partial<Pick<CSSStyleDeclaration, 'color' | 'background' | 'borderColor' | 'boxShadow'>>;

/** onMouseEnter/onMouseLeave handlers that write inline styles, as the Navbar always has. */
export function hoverStyles(enter: HoverStyle, leave: HoverStyle) {
    return {
        onMouseEnter: (e: MouseEvent<HTMLElement>) => {
            Object.assign(e.currentTarget.style, enter);
        },
        onMouseLeave: (e: MouseEvent<HTMLElement>) => {
            Object.assign(e.currentTarget.style, leave);
        },
    };
}

/** Secondary → primary text colour on hover. */
export const textHover = hoverStyles({ color: 'var(--text-primary)' }, { color: 'var(--text-secondary)' });

/** Accent button background on hover. */
export const accentHover = hoverStyles({ background: 'var(--accent-hover)' }, { background: 'var(--accent)' });
