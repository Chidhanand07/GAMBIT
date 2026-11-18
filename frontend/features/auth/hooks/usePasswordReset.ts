'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ResetStatus = 'idle' | 'loading' | 'success' | 'error';

/** Sends the Supabase password-reset e-mail (moved unchanged from app/reset-password/page.tsx). */
export function usePasswordReset() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<ResetStatus>('idle');
    const [message, setMessage] = useState('');

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        const { error } = await createClient().auth.resetPasswordForEmail(email);
        if (error) {
            setMessage(error.message);
            setStatus('error');
        } else {
            setMessage('A password reset link has been sent to your email.');
            setStatus('success');
        }
    };

    return { email, setEmail, status, message, onSubmit };
}
