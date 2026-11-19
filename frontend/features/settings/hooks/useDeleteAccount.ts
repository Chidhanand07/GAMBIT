import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestAccountDeletion } from '@/lib/api/account';
import { createClient } from '@/lib/supabase/client';
import { SETTINGS_STORAGE_KEY } from '../store';

const MESSAGES: Record<string, string> = {
    username_mismatch: 'That is not your username.',
    password_required: 'Enter your password.',
    wrong_password: 'That password is not right.',
    reauth_required: 'For your security, sign in again, then delete your account within 10 minutes.',
    mfa_required: 'Sign in again with your two-factor code, then try again.',
    active_game: 'Finish or resign your current game first.',
    rate_limited: 'Too many attempts. Try again later.',
    rate_limit_unavailable: 'Account deletion is unavailable right now. Try again later.',
    auth_delete_failed: 'Your data was deleted, but your sign-in could not be removed. Contact support.',
};
const FALLBACK = 'Your account could not be deleted. Try again.';

async function reason(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: unknown };
        return (typeof body.error === 'string' && MESSAGES[body.error]) || FALLBACK;
    } catch {
        return FALLBACK;
    }
}

/** After a deletion: forget this browser's session and stored settings (the caller then leaves). */
async function forgetSession() {
    await createClient()
        .auth.signOut({ scope: 'local' })
        .catch(() => {});
    try {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
        /* blocked storage: nothing to clear */
    }
}

/**
 * The Account card's "Delete account" (ADR F-145): a dialog that only submits once the username is
 * typed exactly (and the password given when the account has one); the server re-checks both.
 */
export function useDeleteAccount(username: string, needsPassword: boolean) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const canSubmit = typed === username && (!needsPassword || password.length > 0) && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError('');
        try {
            const res = await requestAccountDeletion({
                confirmUsername: typed,
                ...(needsPassword ? { password } : {}),
            });
            if (res.ok) {
                await forgetSession();
                router.push('/');
                router.refresh();
                return;
            }
            setError(await reason(res));
        } catch {
            setError(FALLBACK);
        }
        setBusy(false);
    };
    const close = () => {
        setOpen(false);
        setTyped('');
        setPassword('');
        setError('');
    };

    return {
        open,
        start: () => setOpen(true),
        close,
        typed,
        setTyped,
        password,
        setPassword,
        needsPassword,
        canSubmit,
        error,
        busy,
        submit: () => void submit(),
    };
}

export type DeleteAccountState = ReturnType<typeof useDeleteAccount>;
