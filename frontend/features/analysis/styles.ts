import type { FocusEvent, MouseEvent } from 'react';

/** Secondary → primary text colour on hover (inline style, as the page always did). */
export const textHover = {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
        e.currentTarget.style.color = 'var(--text-primary)';
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
        e.currentTarget.style.color = 'var(--text-secondary)';
    },
};

/** Accent border while a textarea is focused. */
export const focusBorder = {
    onFocus: (e: FocusEvent<HTMLTextAreaElement>) => {
        e.target.style.borderColor = 'var(--border-accent)';
    },
    onBlur: (e: FocusEvent<HTMLTextAreaElement>) => {
        e.target.style.borderColor = 'var(--border)';
    },
};

export const panelSurface = { background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' };
