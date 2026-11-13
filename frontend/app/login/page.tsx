"use client";

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleSignInButton, OrDivider } from '@/features/auth/components/GoogleSignInButton';
import { startGoogleSignIn } from '@/features/auth/googleSignIn';

function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search) {
            const redirect = searchParams.get('redirect');
            const newUrl = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
            window.history.replaceState({}, '', newUrl);
        }
    }, [searchParams]);

    useEffect(() => {
        if (error) setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preserved: clear the error only when an input changes, never when the error itself is set
    }, [email, password]);

    const handleGoogleSignIn = () => startGoogleSignIn(setError);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        let successRedirect = false;

        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

            if (authError) {
                setError("Invalid email or password");
                setLoading(false);
                return;
            }

            successRedirect = true;
        } catch {
            setError("Something went wrong. Please try again.");
            setLoading(false);
            return;
        }

        if (successRedirect) {
            const redirectPath = searchParams.get('redirect') || '/lobby';
            router.push(redirectPath);
            router.refresh();
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-surface border border-border p-8 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="text-center mb-8">
                    <h1 className="text-3xl text-text-primary font-medium flex items-center justify-center gap-3">
                        <LogIn size={28} className="text-accent" /> Welcome Back
                    </h1>
                    <p className="text-text-secondary mt-2">Log in to your Gambit account</p>
                </div>

                {error && (
                    <div className="flex items-start gap-3 bg-elevated border-l-2 border-l-[#C0392B] border-y border-r border-border-strong text-text-primary text-sm p-3 rounded-md mb-6 shadow-sm">
                        <AlertCircle size={16} className="text-[#C0392B] shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Google OAuth */}
                <GoogleSignInButton onClick={handleGoogleSignIn} iconProps={{ xmlns: 'http://www.w3.org/2000/svg' }} />

                <OrDivider />

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-text-secondary text-sm mb-1">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent disabled:opacity-50" />
                    </div>
                    <div>
                        <label className="block text-text-secondary text-sm mb-1">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent disabled:opacity-50" />
                    </div>

                    <button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-surface font-medium py-3 rounded-lg transition-colors flex justify-center items-center gap-2 mt-4 text-[15px]">
                        {loading ? <><Loader2 size={20} className="animate-spin" /> Signing in...</> : 'Sign In'}
                    </button>

                    <div className="text-center pt-2">
                        <Link href="/reset-password" className="text-accent text-sm hover:underline">Forgot password?</Link>
                    </div>
                </form>

                <div className="mt-8 pt-6 border-t border-border text-center">
                    <p className="text-text-secondary text-sm">
                        Don&apos;t have an account? <Link href="/signup" className="text-accent hover:underline">Sign up</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

// Next 14.1+ fails the production build when a statically rendered page reads
// useSearchParams() outside a Suspense boundary; the form is the part that reads them.
export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
