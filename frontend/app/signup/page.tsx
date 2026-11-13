"use client";

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2 } from 'lucide-react';
import { GoogleSignInButton, OrDivider } from '@/features/auth/components/GoogleSignInButton';
import { SignupFields, type SignupFieldValues } from '@/features/auth/components/SignupFields';
import { useUsernameAvailability } from '@/features/auth/hooks/useUsernameAvailability';
import { startGoogleSignIn } from '@/features/auth/googleSignIn';
import { PASSWORD_MISMATCH, registerAndSignIn, validateSignup } from '@/features/auth/signup';

function KnightLogo() {
    return (
        <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center border border-accent/20">
                <span className="font-serif select-none" style={{ color: '#C4965A', fontSize: '28px', lineHeight: 1 }}>♘</span>
            </div>
            <span className="text-accent text-xl font-medium">Gambit</span>
        </div>
    );
}

function SignupForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [username, setUsername] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Debounced username availability check
    const usernameStatus = useUsernameAvailability(username);

    const setters: Record<keyof SignupFieldValues, (value: string) => void> = {
        email: setEmail, username: setUsername, password: setPassword, confirm: setConfirm,
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        const invalid = validateSignup({ email, password, username }, confirm, usernameStatus);
        if (invalid) { setError(invalid); return; }

        setLoading(true);
        setError(null);

        try {
            const message = await registerAndSignIn({ email, password, username });
            if (message) setError(message);
        } catch {
            setError("Connection failed. Please check your internet connection.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-[400px] bg-surface border border-border p-10 rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <KnightLogo />

                <h1 className="text-2xl text-text-primary font-medium text-center mb-1">Create account</h1>
                <p className="text-text-secondary text-sm text-center mb-8">Start your chess journey on Gambit</p>

                {error && (
                    <div className="flex items-start gap-3 bg-elevated border-l-2 border-l-[#C0392B] border border-border-strong text-text-primary text-sm p-3 rounded-lg mb-6">
                        <AlertCircle size={15} className="text-[#C0392B] shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Google OAuth */}
                <GoogleSignInButton onClick={() => startGoogleSignIn(setError)} />

                <OrDivider />

                <form onSubmit={handleSignup} className="space-y-4">
                    <SignupFields
                        values={{ email, username, password, confirm }}
                        onChange={(field, value) => {
                            // Typing clears the error (only an input change does; setting the error does not).
                            setters[field](value);
                            setError(null);
                        }}
                        disabled={loading}
                        usernameStatus={usernameStatus}
                        confirmMismatch={error === PASSWORD_MISMATCH}
                    />

                    <button
                        type="submit"
                        disabled={loading || usernameStatus === 'taken'}
                        className="w-full h-[44px] bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-surface font-medium rounded-lg transition-colors flex justify-center items-center gap-2 mt-2"
                    >
                        {loading ? <><Loader2 size={18} className="animate-spin" /> Creating account...</> : 'Sign Up'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-border text-center">
                    <p className="text-text-secondary text-sm">
                        Already have an account?{' '}
                        <Link href="/login" className="text-accent hover:underline font-medium">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense>
            <SignupForm />
        </Suspense>
    );
}
