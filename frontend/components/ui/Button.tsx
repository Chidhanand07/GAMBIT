import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/design/cn';

export type ButtonVariant = 'primary' | 'primary-flat' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Colours per variant (design/Main.dc.html, Game.dc.html). `.gb` is the primary hover lift. */
const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'gb border-0 bg-accent text-on-accent hover:text-on-accent',
    /** Landing and auth primary (Home, Signin, Signup `.gb`): brightness on hover, no lift. */
    'primary-flat': 'gb-flat border-0 bg-accent text-on-accent hover:text-on-accent',
    /** Landing "Create Account": surface pill with the field border, raised fill on hover/focus. */
    secondary:
        'border-1 border-line-field bg-surface text-ink hover:bg-surface-raised hover:text-ink focus-visible:bg-surface-raised',
    outline: 'border-1.5 border-line-muted bg-transparent text-ink',
    ghost: 'border-0 bg-transparent text-accent hover:text-accent',
    danger: 'border-1.5 border-danger bg-transparent text-danger hover:text-danger',
    'danger-solid': 'border-0 bg-danger text-on-accent hover:text-on-accent',
};

/** Height, padding and type per size: 40 / 44 / 48 / 52 / 56px tall pills. */
const SIZES: Record<ButtonSize, string> = {
    sm: 'min-h-[40px] px-[14px] text-[14px]',
    md: 'min-h-[44px] px-[18px]',
    lg: 'min-h-[48px] px-[22px]',
    xl: 'min-h-[52px] px-[26px] text-[16px]',
    '2xl': 'min-h-[56px] px-[28px] text-[17px]',
};

interface CommonProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
    children: ReactNode;
}

type ButtonProps = CommonProps &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined };
type LinkButtonProps = CommonProps & { href: string; onClick?: () => void; 'aria-label'?: string };

export function buttonClasses({ variant = 'primary', size = 'md', className }: Omit<CommonProps, 'children'>) {
    return cn(
        'inline-flex items-center justify-center gap-[10px] rounded-pill font-semibold no-underline',
        VARIANTS[variant],
        SIZES[size],
        className,
    );
}

/** A pill button (primary | outline | ghost | danger); with `href` it renders a link. */
export function Button(props: ButtonProps | LinkButtonProps) {
    const { variant, size, className, children, ...rest } = props;
    const classes = buttonClasses({ variant, size, className });
    if (rest.href !== undefined) {
        const { href, onClick } = rest;
        return (
            <Link href={href} onClick={onClick} aria-label={rest['aria-label']} className={classes}>
                {children}
            </Link>
        );
    }
    const { type = 'button', ...buttonProps } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
    return (
        <button type={type} className={classes} {...buttonProps}>
            {children}
        </button>
    );
}
