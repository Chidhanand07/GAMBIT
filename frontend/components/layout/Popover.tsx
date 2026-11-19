'use client';

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/design/cn';

interface PopoverProps {
    open: boolean;
    onClose: () => void;
    /** Accessible name of the menu ("Account", "Site", "Notifications"). */
    label: string;
    /**
     * `menu` (default) for lists of actions; `dialog` for a panel that also holds a heading,
     * buttons and status messages (notifications, A4).
     */
    role?: 'menu' | 'dialog';
    /** Clicks inside this element (the trigger cluster) do not count as outside clicks. */
    containerRef: RefObject<HTMLElement | null>;
    /** Gets focus back when Escape closes the menu. */
    triggerRef?: RefObject<HTMLElement | null>;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}

const ITEM = '[role="menuitem"]:not([aria-disabled="true"])';

/** ArrowUp/ArrowDown/Home/End move focus between the menu's focusable items. */
function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEM)).filter((el) => el.tabIndex >= 0);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next: Record<string, number> = {
        ArrowDown: (at + 1) % items.length,
        ArrowUp: (at - 1 + items.length) % items.length,
        Home: 0,
        End: items.length - 1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    items[next[e.key]].focus();
}

/**
 * A header menu panel (`.gp`, design/Main.dc.html): closes on a mousedown outside
 * `containerRef` and on Escape (focus returns to the trigger).
 */
export function Popover(props: PopoverProps) {
    const { open, onClose, label, role = 'menu', containerRef, triggerRef, className, style, children } = props;
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) onCloseRef.current();
        };
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            onCloseRef.current();
            triggerRef?.current?.focus();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, containerRef, triggerRef]);

    if (!open) return null;
    return (
        <div role={role} aria-label={label} className={cn('gp', className)} style={style} onKeyDown={moveFocus}>
            {children}
        </div>
    );
}
