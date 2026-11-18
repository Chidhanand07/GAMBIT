'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeRedirectPath } from '@/lib/safeRedirect';
import { startGoogleSignIn } from '../googleSignIn';
import { loginErrorMessage } from '../loginErrors';

export interface LoginState {
    email: string;
    password: string;
    error: string | null;
    loading: boolean;
    onEmail: (value: string) => void;
    onPassword: (value: string) => void;
    onSubmit: (e: FormEvent) => Promise<void>;
    onGoogle: () => void;
}

/** Email/password sign-in (moved unchanged from app/login/page.tsx), Google OAuth and `?error=`/`?redirect=`. */
export function useLogin(): LoginState {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // F17: an error sent back by the OAuth callback (?error=) is shown, not silently dropped.
    const [error, setError] = useState<string | null>(() => loginErrorMessage(searchParams.get('error')));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search) {
            const redirect = searchParams.get('redirect');
            const newUrl = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
            window.history.replaceState({}, '', newUrl);
        }
    }, [searchParams]);

    // Typing clears the error; done in the change handlers, so an error shown on load survives mount.
    const onEmail = (value: string) => {
        setEmail(value);
        setError(null);
    };
    const onPassword = (value: string) => {
        setPassword(value);
        setError(null);
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
            if (authError) {
                setError('Invalid email or password');
                setLoading(false);
                return;
            }
        } catch {
            setError('Something went wrong. Please try again.');
            setLoading(false);
            return;
        }
        // S6: only a path on this site is followed; anything else goes to /lobby.
        router.push(safeRedirectPath(searchParams.get('redirect')));
        router.refresh();
    };

    const onGoogle = () => void startGoogleSignIn(setError);

    return { email, password, error, loading, onEmail, onPassword, onSubmit, onGoogle };
}
