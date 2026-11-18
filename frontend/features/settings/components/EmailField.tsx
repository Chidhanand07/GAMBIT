import type { EmailLinkResult } from '../hooks/useEmailLinkResult';
import type { EmailChangeState } from '../hooks/useEmailChange';
import { FIELD, HINT, INPUT } from './styles';

/** The line under the field: a followed link's result, a pending change, or nothing. */
function pendingNote(pending: string | null, link: EmailLinkResult): string {
    if (link === 'confirmed' && pending)
        return `One link confirmed. Follow the link sent to the other address to finish.`;
    if (link === 'confirmed') return 'Your email change is confirmed.';
    if (pending) return `Confirmation sent to ${pending}. Follow the link in that email to finish the change.`;
    return '';
}

interface Props {
    email: EmailChangeState;
    link: EmailLinkResult;
}

/** Settings.dc.html Account "Email": editable; a change is confirmed by e-mail (ADR F-143). */
export function EmailField({ email, link }: Props) {
    const note = pendingNote(email.pending, link);
    const error = email.error || (link === 'link_invalid' ? 'That confirmation link is invalid or has expired.' : '');
    return (
        <label className={FIELD}>
            <span className="font-semibold">Email</span>
            <input
                type="email"
                value={email.value}
                placeholder="you@example.com"
                autoComplete="email"
                onChange={(e) => email.change(e.target.value)}
                className={`${INPUT} min-h-[48px]`}
            />
            <span className={HINT}>Used for sign-in and account recovery.</span>
            {note && (
                <span role="status" className="text-[13px] font-semibold text-success-ink">
                    {note}
                </span>
            )}
            {error && (
                <span role="alert" className="text-[13px] font-semibold text-danger">
                    {error}
                </span>
            )}
        </label>
    );
}
