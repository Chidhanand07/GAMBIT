import { Icon } from '@/components/ui/Icon';

interface GoogleSignInButtonProps {
    onClick: () => void;
}

/** "Continue with Google" (`.gg` in Signin.dc.html): globe badge, raised fill and gold border on hover. */
export function GoogleSignInButton({ onClick }: GoogleSignInButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="gg flex min-h-[56px] w-full items-center justify-center gap-3 rounded-14 border-1 border-line-field bg-surface-header text-[16px] font-semibold text-ink"
        >
            <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full border-1 border-line bg-bg-base text-ink"
            >
                <Icon name="globe" />
            </span>
            Continue with Google
        </button>
    );
}

/** The "—— or ——" separator between OAuth and the email form. */
export function OrDivider() {
    return (
        <div className="flex items-center gap-3 text-[13px] text-ink-muted">
            <span aria-hidden="true" className="h-px flex-[1_1_0] bg-line" />
            or
            <span aria-hidden="true" className="h-px flex-[1_1_0] bg-line" />
        </div>
    );
}
