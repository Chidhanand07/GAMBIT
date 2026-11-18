import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** The signed-in user's email from the Supabase session (read-only; null until known or when absent). */
export function useAuthEmail(): string | null {
    const [email, setEmail] = useState<string | null>(null);
    useEffect(() => {
        let current = true;
        void Promise.resolve()
            .then(() => createClient().auth.getUser())
            .then(({ data }) => {
                if (current) setEmail(data.user?.email ?? null);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, []);
    return email;
}
