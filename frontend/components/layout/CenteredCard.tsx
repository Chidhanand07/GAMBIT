import type { ReactNode } from 'react';
import { LogoTile } from '@/components/ui/KnightMark';

interface CenteredCardProps {
    title: string;
    subtitle?: ReactNode;
    /** Above the heading; the gold logo tile by default. */
    icon?: ReactNode;
    id?: string;
    children?: ReactNode;
}

/**
 * The centred card of Signin.dc.html / Signup.dc.html (440px, 28px radius, logo tile, heading).
 * Screens with no mockup of their own (invites, not found, errors) use it too.
 */
export function CenteredCard({ title, subtitle, icon, id, children }: CenteredCardProps) {
    return (
        <div id={id} className="box-border flex justify-center px-6 pb-24 pt-14">
            <div className="box-border flex w-full max-w-[440px] flex-col gap-5 rounded-28 border-1 border-line bg-surface p-9 shadow-auth-card">
                <div className="flex flex-col items-center gap-[10px] text-center">
                    {icon ?? <LogoTile size="lg" />}
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
