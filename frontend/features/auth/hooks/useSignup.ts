'use client';

import { useState, type FormEvent } from 'react';
import type { SignupFieldValues } from '../components/SignupFields';
import { startGoogleSignIn } from '../googleSignIn';
import { PASSWORD_MISMATCH, registerAndSignIn, validateSignup } from '../signup';
import { useUsernameAvailability, type UsernameStatus } from './useUsernameAvailability';

export interface SignupState {
    values: SignupFieldValues;
    error: string | null;
    loading: boolean;
    usernameStatus: UsernameStatus;
    confirmMismatch: boolean;
    onChange: (field: keyof SignupFieldValues, value: string) => void;
    onSubmit: (e: FormEvent) => Promise<void>;
    onGoogle: () => void;
}

const EMPTY: SignupFieldValues = { email: '', username: '', password: '', confirm: '' };

/** Sign-up form state (moved unchanged from app/signup/page.tsx): validation, API + sign-in, Google OAuth. */
export function useSignup(): SignupState {
    const [values, setValues] = useState<SignupFieldValues>(EMPTY);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    // Debounced username availability check
    const usernameStatus = useUsernameAvailability(values.username);

    // Typing clears the error (only an input change does; setting the error does not).
    const onChange = (field: keyof SignupFieldValues, value: string) => {
        setValues((prev) => ({ ...prev, [field]: value }));
        setError(null);
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const { email, password, username, confirm } = values;
        const invalid = validateSignup({ email, password, username }, confirm, usernameStatus);
        if (invalid) {
            setError(invalid);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const message = await registerAndSignIn({ email, password, username });
            if (message) setError(message);
        } catch {
            setError('Connection failed. Please check your internet connection.');
        } finally {
            setLoading(false);
        }
    };

    const onGoogle = () => void startGoogleSignIn(setError);

    return {
        values,
        error,
        loading,
        usernameStatus,
        confirmMismatch: error === PASSWORD_MISMATCH,
        onChange,
        onSubmit,
        onGoogle,
    };
}
