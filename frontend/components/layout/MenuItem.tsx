import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';

interface MenuItemProps {
    icon?: IconName;
    /** `danger` is the coral Sign Out row. */
    tone?: 'default' | 'danger';
    /** A link row when set, otherwise a button row. */
    href?: string;
    onSelect?: () => void;
    className?: string;
    children: ReactNode;
}

/** A 44px menu row (`.gi`): icon + label, hover/focus fill from app/globals.css. */
export function MenuItem({ icon, tone = 'default', href, onSelect, className, children }: MenuItemProps) {
    // Mockup rows carry an inline colour, so the global `a:hover` white never applies to them.
    const classes = cn('gi', tone === 'danger' ? 'text-danger hover:text-danger' : 'hover:text-ink', className);
    const content = (
        <>
            {icon && <Icon name={icon} />}
            {children}
        </>
    );
    if (href !== undefined) {
        return (
            <Link role="menuitem" href={href} onClick={onSelect} className={classes}>
                {content}
            </Link>
        );
    }
    return (
        <button type="button" role="menuitem" onClick={onSelect} className={classes}>
            {content}
        </button>
    );
}

/** The 1px divider between menu groups (`.gd`). */
export function MenuDivider({ className }: { className?: string }) {
    return <div aria-hidden="true" className={cn('gd', className)} />;
}
