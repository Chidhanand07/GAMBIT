'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@/components/ProfileProvider';
import { safeRedirectPath } from '@/lib/safeRedirect';
import { startGoogleSignIn } from '../googleSignIn';
import { signInWithIdentifier } from '../login';
import { loginErrorMessage } from '../loginErrors';
import { useSecondFactorStep, type SecondFactorStep } from './useSecondFactorStep';

export interface LoginState {
    /** An e-mail or a username (Signin.dc.html "Email or username"). */
    identifier: string;
    password: string;
    error: string | null;
    loading: boolean;
    onIdentifier: (value: string) => void;
    onPassword: (value: string) => void;
    onSubmit: (e: FormEvent) => Promise<void>;
    onGoogle: () => void;
    /** The authentication-code step, when two-factor is on (ADR F-144). */
    secondFactor: SecondFactorStep;
}

/** Email-or-username/password sign-in (server-side, F-101), Google OAuth and `?error=`/`?redirect=`. */
export function useLogin(): LoginState {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { refetch: refetchProfile } = useProfile();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    // F17: an error sent back by the OAuth callback (?error=) is shown, not silently dropped.
    const [error, setError] = useState<string | null>(() => loginErrorMessage(searchParams.get('error')));
    const [loading, setLoading] = useState(false);
    const proceed = () => {
        // The session cookies came back on the response; the header and socket pick them up here.
        refetchProfile();
        // S6: only a path on this site is followed; anything else goes to /lobby.
        router.push(safeRedirectPath(searchParams.get('redirect')));
        router.refresh();
    };
    // Read once: the URL clean-up below drops `?mfa=1` from the address bar.
    const [resumeSecondFactor] = useState(() => searchParams.get('mfa') === '1');
    const secondFactor = useSecondFactorStep(proceed, resumeSecondFactor);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search) {
            const redirect = searchParams.get('redirect');
            const newUrl = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
            window.history.replaceState({}, '', newUrl);
        }
    }, [searchParams]);

    // Typing clears the error; done in the change handlers, so an error shown on load survives mount.
    const onIdentifier = (value: string) => {
        setIdentifier(value);
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
            const message = await signInWithIdentifier(identifier, password);
            if (message) {
                setError(message);
                setLoading(false);
                return;
            }
        } catch {
            setError('Something went wrong. Please try again.');
            setLoading(false);
            return;
        }
        if (await secondFactor.check()) {
            setLoading(false);
            return;
        }
        proceed();
    };

    const onGoogle = () => void startGoogleSignIn(setError);

    return { identifier, password, error, loading, onIdentifier, onPassword, onSubmit, onGoogle, secondFactor };
}
