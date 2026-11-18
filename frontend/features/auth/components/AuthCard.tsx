import type { ReactNode } from 'react';
import { CenteredCard } from '@/components/layout/CenteredCard';

interface AuthCardProps {
    title: string;
    subtitle?: string;
    children: ReactNode;
}

/** The centred auth card (Signin.dc.html / Signup.dc.html): logo tile, heading, then the form. */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
    return (
        <CenteredCard id="top" title={title} subtitle={subtitle}>
            {children}
        </CenteredCard>
    );
}

/** The 1px rule above the card's footer line. */
export function AuthRule() {
    return <div aria-hidden="true" className="h-px bg-line" />;
}

/** "New to Gambit? Create an account" style footer line. */
export function AuthFooter({ children }: { children: ReactNode }) {
    return <p className="m-0 text-center text-ink-muted">{children}</p>;
}

interface AuthAlertProps {
    tone?: 'error' | 'success';
    children: ReactNode;
}

/** A sign-in error or confirmation inside the card (not in the mockup, which shows no states). */
export function AuthAlert({ tone = 'error', children }: AuthAlertProps) {
    const colours =
        tone === 'error'
            ? 'border-danger-line bg-danger-bg text-danger'
            : 'border-success bg-success-bg text-success-ink';
    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            className={`rounded-14 border-1 px-4 py-3 text-[14px] font-medium ${colours}`}
        >
            {children}
        </div>
    );
}
