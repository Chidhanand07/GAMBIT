import { useState } from 'react';
import { requestEmailChange } from '@/lib/api/account';
import type { AuthAccount } from './useAuthAccount';

export type EmailSubmit = 'unchanged' | 'pending' | 'error';

const GENERIC_ERROR = 'Could not change your email. Try again.';
const RATE_LIMITED = 'Too many attempts. Try again later.';
const HTTP_TOO_MANY_REQUESTS = 429;

async function errorMessage(res: Response): Promise<string> {
    if (res.status === HTTP_TOO_MANY_REQUESTS) return RATE_LIMITED;
    try {
        const body = (await res.json()) as { error?: unknown };
        return typeof body.error === 'string' && body.error !== 'rate_limited' ? body.error : GENERIC_ERROR;
    } catch {
        return GENERIC_ERROR;
    }
}

/**
 * The Account card's editable Email field (ADR F-143). A changed address is sent to
 * POST /api/account/email; nothing changes until the confirmation link is followed, so the
 * field shows the pending address and says where to look. The field follows the signed-in
 * address whenever that changes (state adjusted during render, not in an effect).
 */
export function useEmailChange(account: AuthAccount & { refresh: () => void }) {
    const [value, setValue] = useState(account.email ?? '');
    const [base, setBase] = useState(account.email);
    const [error, setError] = useState('');
    const [sentTo, setSentTo] = useState<string | null>(null);

    if (account.email !== base) {
        setBase(account.email);
        setValue(account.email ?? '');
    }

    const normalised = value.trim().toLowerCase();
    const dirty = normalised !== (account.email ?? '').toLowerCase();
    const pending = sentTo ?? account.newEmail;

    const submit = async (): Promise<EmailSubmit> => {
        if (!dirty) return 'unchanged';
        setError('');
        try {
            const res = await requestEmailChange(normalised);
            if (!res.ok) {
                setError(await errorMessage(res));
                return 'error';
            }
            setSentTo(normalised);
            account.refresh();
            return 'pending';
        } catch {
            setError(GENERIC_ERROR);
            return 'error';
        }
    };
    const change = (next: string) => {
        setValue(next);
        setError('');
    };
    const reset = () => {
        setValue(account.email ?? '');
        setError('');
    };

    return { value, change, submit, reset, dirty, pending, error };
}

export type EmailChangeState = ReturnType<typeof useEmailChange>;
