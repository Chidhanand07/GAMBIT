"use client";

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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

    const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'available'|'taken'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (error) setError(null);
    }, [email, password, confirm, username]);

    // Debounced username availability check
    useEffect(() => {
        if (username.length < 3) {
            setUsernameStatus('idle');
            return;
        }

        const timer = setTimeout(async () => {
            setUsernameStatus('checking');
            try {
                const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';
                const res = await fetch(`${socketUrl}/api/users/check-username?u=${encodeURIComponent(username)}`);
                if (res.ok) {
                    const data = await res.json();
                    setUsernameStatus(data.available ? 'available' : 'taken');
                } else {
                    setUsernameStatus('idle');
                }
            } catch {
                setUsernameStatus('idle');
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [username]);

    const handleGoogleSignIn = async () => {
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/auth/callback` },
            })
            if (error) setError('Google sign-in failed. Please try again.')
        } catch {
            setError('Google sign-in failed. Please try again.')
        }
    }

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
        if (password !== confirm) { setError("Passwords do not match"); return; }
        if (usernameStatus === 'taken') { setError("Username already taken"); return; }
        if (username.length < 3) { setError("Username must be at least 3 characters"); return; }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError("Username may only contain letters, numbers, and underscores"); return; }

        setLoading(true);
        setError(null);

        try {
            console.log('[signup] calling /api/auth/signup...');
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, username }),
            });

            const data = await res.json().catch(() => ({}));
            console.log('[signup] API response:', res.status, data);

            if (!res.ok) {
                setError(data.error || 'Signup failed. Please try again.');
                return;
            }

            console.log('[signup] profile created, signing in via browser client...');
            const supabase = createClient();
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

            console.log('[signup] signIn result:', {
                user: signInData?.user?.email ?? null,
                session: signInData?.session ? `expires=${signInData.session.expires_at}` : null,
                error: signInError?.message ?? null,
            });

            if (signInError) {
                console.error('[signup] sign-in after signup failed:', signInError.message);
                setError('Account created! Please sign in.');
                return;
            }

            if (!signInData.session) {
                console.warn('[signup] no session after sign-in — email confirmation likely required');
                setError('Account created! Please confirm your email then sign in.');
                return;
            }

            console.log('[signup] cookies after sign-in:', document.cookie.split(';').map(s => s.trim().split('=')[0]));
            console.log('[signup] navigating to /lobby...');
            window.location.assign('/lobby');
        } catch (err) {
            console.error('[signup] unexpected error:', err);
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
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 bg-elevated border border-border-strong hover:bg-hover text-text-primary font-medium py-3 rounded-lg transition-colors mb-4"
                >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continue with Google
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border"></div>
                    <span className="text-text-tertiary text-xs">or</span>
                    <div className="flex-1 h-px bg-border"></div>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-text-secondary text-sm mb-1.5">Email</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            disabled={loading}
                            className="w-full h-[44px] bg-elevated border border-border-strong rounded-lg px-4 text-text-primary focus:outline-none focus:border-accent focus:ring-[1.5px] focus:ring-accent/20 disabled:opacity-50 transition-colors"
                        />
                    </div>

                    <div>
                        <label htmlFor="username" className="block text-text-secondary text-sm mb-1.5">
                            Username
                            <span className="text-text-tertiary text-xs ml-2">letters, numbers, underscores</span>
                        </label>
                        <div className="relative">
                            <input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                                disabled={loading}
                                maxLength={20}
                                className="w-full h-[44px] bg-elevated border border-border-strong rounded-lg px-4 pr-10 text-text-primary focus:outline-none focus:border-accent focus:ring-[1.5px] focus:ring-accent/20 disabled:opacity-50 transition-colors"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {usernameStatus === 'checking' && <Loader2 size={15} className="text-text-tertiary animate-spin" />}
                                {usernameStatus === 'available' && <Check size={15} className="text-indicator-green" strokeWidth={2.5} />}
                                {usernameStatus === 'taken' && <X size={15} className="text-[#C0392B]" strokeWidth={2.5} />}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-text-secondary text-sm mb-1.5">Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            disabled={loading}
                            minLength={8}
                            className="w-full h-[44px] bg-elevated border border-border-strong rounded-lg px-4 text-text-primary focus:outline-none focus:border-accent focus:ring-[1.5px] focus:ring-accent/20 disabled:opacity-50 transition-colors"
                        />
                    </div>

                    <div>
                        <label htmlFor="confirm" className="block text-text-secondary text-sm mb-1.5">Confirm Password</label>
                        <input
                            id="confirm"
                            name="confirm"
                            type="password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            required
                            disabled={loading}
                            className={`w-full h-[44px] bg-elevated border rounded-lg px-4 text-text-primary focus:outline-none focus:ring-[1.5px] disabled:opacity-50 transition-colors ${
                                error === 'Passwords do not match'
                                    ? 'border-[#C0392B] focus:border-[#C0392B] focus:ring-[#C0392B]/20'
                                    : 'border-border-strong focus:border-accent focus:ring-accent/20'
                            }`}
                        />
                    </div>

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
