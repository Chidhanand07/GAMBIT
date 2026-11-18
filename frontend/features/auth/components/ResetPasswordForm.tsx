'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePasswordReset } from '../hooks/usePasswordReset';
import { AuthAlert, AuthCard, AuthFooter, AuthRule } from './AuthCard';
import { AuthField } from './AuthField';

const LINK = 'font-semibold text-accent underline hover:text-accent';

/** Password reset on the sign-in card shell (Signin.dc.html). */
export function ResetPasswordForm() {
    const reset = usePasswordReset();
    const done = reset.status === 'success';
    return (
        <AuthCard title="Reset password" subtitle="We'll email you a link to choose a new one">
            {reset.status === 'error' && <AuthAlert>{reset.message}</AuthAlert>}
            {done ? (
                <AuthAlert tone="success">{reset.message}</AuthAlert>
            ) : (
                <form onSubmit={(e) => void reset.onSubmit(e)} className="flex flex-col gap-4">
                    <AuthField
                        id="email"
                        name="email"
                        label="Email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={reset.email}
                        onChange={(e) => reset.setEmail(e.target.value)}
                        required
                    />
                    <Button
                        type="submit"
                        variant="primary-flat"
                        size="2xl"
                        className="mt-1 font-bold disabled:opacity-50"
                        disabled={reset.status === 'loading'}
                    >
                        {reset.status === 'loading' ? (
                            <Loader2 aria-label="Sending" size={20} className="animate-spin" />
                        ) : (
                            'Send Reset Link'
                        )}
                    </Button>
                </form>
            )}
            <AuthRule />
            <AuthFooter>
                <Link href="/login" className={LINK}>
                    {done ? 'Back to Login' : 'Cancel'}
                </Link>
            </AuthFooter>
        </AuthCard>
    );
}
