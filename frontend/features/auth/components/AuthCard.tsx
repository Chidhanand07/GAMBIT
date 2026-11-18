import type { ReactNode } from 'react';
import { LogoTile } from '@/components/ui/KnightMark';

interface AuthCardProps {
    title: string;
    subtitle?: string;
    children: ReactNode;
}

/** The centred auth card (Signin.dc.html / Signup.dc.html): logo tile, heading, then the form. */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
    return (
        <div id="top" className="box-border flex justify-center px-6 pb-24 pt-14">
            <div className="box-border flex w-full max-w-[440px] flex-col gap-5 rounded-28 border-1 border-line bg-surface p-9 shadow-auth-card">
                <div className="flex flex-col items-center gap-[10px] text-center">
                    <LogoTile size="lg" />
                    <h1 className="m-0 mt-2 font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em]">
                        {title}
                    </h1>
                    {subtitle && <p className="m-0 text-ink-muted">{subtitle}</p>}
                </div>
                {children}
            </div>
        </div>
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
