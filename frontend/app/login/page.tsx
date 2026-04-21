"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
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
    }, [email, password]);

    const handleGoogleSignIn = async () => {
        try {
            const supabase = createClient();
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/auth/callback` },
            });
            if (oauthError) setError('Google sign-in failed. Please try again.');
        } catch {
            setError('Google sign-in failed. Please try again.');
        }
    };

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
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 bg-elevated border border-border-strong hover:bg-hover text-text-primary font-medium py-3 rounded-lg transition-colors mb-4"
                >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
                        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
                    </svg>
                    Continue with Google
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border"></div>
                    <span className="text-text-tertiary text-xs">or</span>
                    <div className="flex-1 h-px bg-border"></div>
                </div>

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
