'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLogin } from '../hooks/useLogin';
import { AuthAlert, AuthCard, AuthFooter, AuthRule } from './AuthCard';
import { AuthField, ShowPasswordToggle } from './AuthField';
import { GoogleSignInButton, OrDivider } from './GoogleSignInButton';

const FORGOT_LINK = 'flex min-h-[44px] items-center text-[14px] font-semibold text-accent underline hover:text-accent';

/** The sign-in card (Signin.dc.html), wired to useLogin. */
export function LoginForm() {
    const login = useLogin();
    const [shown, setShown] = useState(false);
    return (
        <AuthCard title="Welcome back" subtitle="Sign in to pick up your games">
            {login.error && <AuthAlert>{login.error}</AuthAlert>}
            <GoogleSignInButton onClick={login.onGoogle} />
            <OrDivider />
            <form onSubmit={(e) => void login.onSubmit(e)} className="flex flex-col gap-4">
                <AuthField
                    id="email"
                    name="email"
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={login.email}
                    onChange={(e) => login.onEmail(e.target.value)}
                    required
                    disabled={login.loading}
                />
                <AuthField
                    id="password"
                    name="password"
                    label="Password"
                    type={shown ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    autoComplete="current-password"
                    value={login.password}
                    onChange={(e) => login.onPassword(e.target.value)}
                    required
                    disabled={login.loading}
                    action={
                        <Link href="/reset-password" className={FORGOT_LINK}>
                            Forgot password?
                        </Link>
                    }
                    trailing={<ShowPasswordToggle shown={shown} onToggle={() => setShown((s) => !s)} />}
                />
                <Button
                    type="submit"
                    variant="primary-flat"
                    size="2xl"
                    className="mt-1 font-bold disabled:opacity-50"
                    disabled={login.loading}
                >
                    {login.loading ? (
                        <>
                            <Loader2 aria-hidden="true" size={20} className="animate-spin" /> Signing in...
                        </>
                    ) : (
                        'Sign in'
                    )}
                </Button>
            </form>
            <AuthRule />
            <AuthFooter>
                New to Gambit?{' '}
                <Link href="/signup" className="font-semibold text-accent underline hover:text-accent">
                    Create an account
                </Link>
            </AuthFooter>
        </AuthCard>
    );
}
