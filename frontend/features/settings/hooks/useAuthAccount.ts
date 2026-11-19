import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** The signed-in user's sign-in details from Supabase Auth (null until known or when absent). */
export interface AuthAccount {
    email: string | null;
    /** An e-mail change waiting for its confirmation link(s), if any. */
    newEmail: string | null;
    /** The account has a password (an `email` identity), so deleting it asks for that password. */
    hasPassword: boolean;
}

const UNKNOWN: AuthAccount = { email: null, newEmail: null, hasPassword: true };

async function readAccount(): Promise<AuthAccount> {
    const { data } = await createClient().auth.getUser();
    const user = data.user;
    return {
        email: user?.email ?? null,
        newEmail: user?.new_email ?? null,
        hasPassword: user ? (user.identities ?? []).some((i) => i.provider === 'email') : true,
    };
}

/** The current user's e-mail and pending e-mail change; `refresh()` re-reads them. */
export function useAuthAccount(): AuthAccount & { refresh: () => void } {
    const [account, setAccount] = useState<AuthAccount>(UNKNOWN);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        let current = true;
        void Promise.resolve()
            .then(readAccount)
            .then((next) => {
                if (current) setAccount(next);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, [version]);
    const refresh = useCallback(() => setVersion((v) => v + 1), []);
    return { ...account, refresh };
}
