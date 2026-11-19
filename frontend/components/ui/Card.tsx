import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/design/cn';

export type CardTone = 'default' | 'raised' | 'inset' | 'header';

/** Surfaces from the mockups: content card, the raised "You're playing" bar, inset wells, panels. */
const TONES: Record<CardTone, string> = {
    default: 'rounded-20 border-1 border-line bg-surface p-5',
    raised: 'rounded-24 border-1 border-line-strong bg-surface-raised p-6',
    inset: 'rounded-14 border-1 border-line-subtle bg-bg-base p-[14px]',
    header: 'rounded-20 border-1 border-line bg-surface-header p-5',
};

interface CardProps extends HTMLAttributes<HTMLElement> {
    as?: 'section' | 'div' | 'article' | 'aside';
    tone?: CardTone;
    children: ReactNode;
}

/** A bordered surface; layout (flex, gap) comes from `className`. */
export function Card({ as: Tag = 'section', tone = 'default', className, children, ...rest }: CardProps) {
    return (
        <Tag className={cn('box-border text-ink', TONES[tone], className)} {...rest}>
            {children}
        </Tag>
    );
}
