'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSignup } from '../hooks/useSignup';
import { AuthAlert, AuthCard, AuthFooter, AuthRule } from './AuthCard';
import { GoogleSignInButton, OrDivider } from './GoogleSignInButton';
import { SignupFields } from './SignupFields';

/** The sign-up card (Signup.dc.html), wired to useSignup. */
export function SignupForm() {
    const signup = useSignup();
    return (
        <AuthCard title="Create account" subtitle="Start your chess journey on Gambit">
            {signup.error && <AuthAlert>{signup.error}</AuthAlert>}
            <GoogleSignInButton onClick={signup.onGoogle} />
            <OrDivider />
            <form onSubmit={(e) => void signup.onSubmit(e)} className="flex flex-col gap-4">
                <SignupFields
                    values={signup.values}
                    onChange={signup.onChange}
                    disabled={signup.loading}
                    usernameStatus={signup.usernameStatus}
                    confirmMismatch={signup.confirmMismatch}
                />
                <Button
                    type="submit"
                    variant="primary-flat"
                    size="2xl"
                    className="mt-1 font-bold disabled:opacity-50"
                    disabled={signup.loading || signup.usernameStatus === 'taken'}
                >
                    {signup.loading ? (
                        <>
                            <Loader2 aria-hidden="true" size={18} className="animate-spin" /> Creating account...
                        </>
                    ) : (
                        'Sign up'
                    )}
                </Button>
            </form>
            <AuthRule />
            <AuthFooter>
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-accent underline hover:text-accent">
                    Sign in
                </Link>
            </AuthFooter>
        </AuthCard>
    );
}
