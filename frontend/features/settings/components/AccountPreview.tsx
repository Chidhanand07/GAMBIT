import { PreviewCard } from './PreviewCard';

const WELL = 'flex min-h-[44px] items-center rounded-12 border-1 border-line bg-bg-base px-[14px]';

/** The sign-in screen as this account sees it. */
export function AccountPreview({ email }: { email: string | null }) {
    return (
        <PreviewCard>
            <div className="flex flex-col gap-2">
                <span className="text-[13px] text-ink-muted">Sign-in screen</span>
                <span className={`${WELL} text-[14px] [overflow-wrap:anywhere]`}>{email ?? 'Email not available'}</span>
                <span className={`${WELL} tracking-[0.2em]`}>••••••••</span>
            </div>
        </PreviewCard>
    );
}
