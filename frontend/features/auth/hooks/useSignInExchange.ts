'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeRedirectPath } from '@/lib/safeRedirect';

const OAUTH_FAILED = '/login?error=oauth_failed';
const ERROR_REDIRECT_MS = 2000;

type SignInResult = Promise<{ error: { message: string } | null }>;

/**
 * Starts the sign-in the URL carries: a PKCE `code` in the query string, or implicit-flow
 * tokens in the hash (never sent to the server). Null when there is nothing to work with.
 */
function startSignIn(code: string | null): SignInResult | null {
    if (code) return createClient().auth.exchangeCodeForSession(code);
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    return createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

/**
 * The OAuth landing step (/auth/exchange): turn the URL's code or tokens into a session,
 * then go to `next` (a same-site path, S6). On failure the error is returned for display
 * and the page moves to the login error after 2 s.
 */
export function useSignInExchange(): string | null {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [errMsg, setErrMsg] = useState<string | null>(null);

    useEffect(() => {
        // S6: only a path on this site is followed; anything else goes to /lobby.
        const next = safeRedirectPath(searchParams.get('next'));
        // F17: a sign-in that settles after the page is gone must not navigate, and the
        // error redirect timer is cleared on unmount.
        let active = true;
        let errorTimer: ReturnType<typeof setTimeout> | null = null;
        const settle = ({ error }: { error: { message: string } | null }) => {
            if (!active) return;
            if (error) {
                setErrMsg(error.message);
                errorTimer = setTimeout(() => router.replace(OAUTH_FAILED), ERROR_REDIRECT_MS);
                return;
            }
            router.replace(next);
        };
        const cleanup = () => {
            active = false;
            if (errorTimer !== null) clearTimeout(errorTimer);
        };

        const pending = startSignIn(searchParams.get('code'));
        if (!pending) {
            router.replace(OAUTH_FAILED);
            return cleanup;
        }
        void pending.then(settle);
        return cleanup;
    }, [router, searchParams]);

    return errMsg;
}
