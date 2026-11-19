'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useProfile } from '@/components/ProfileProvider';
import { needsSecondFactor } from '@/lib/mfa';
import { loadBrowserClient } from '@/lib/supabase/lazyClient';

/** Pages where an unfinished sign-in may stay (the code is entered on /login). */
const OPEN_PATHS = ['/login', '/signup', '/reset-password', '/auth'];

/**
 * Two-factor sign-in (ADR F-144): a session that signed in with a password or Google but has not
 * entered its code yet (AAL1 with a verified factor) is sent to /login to finish. Optimistic, like
 * the proxy: the account-changing routes check the assurance level on the server themselves.
 */
export default function SecondFactorGate() {
    const { profile } = useProfile();
    const pathname = usePathname();
    const router = useRouter();
    const signedIn = Boolean(profile?.id);

    useEffect(() => {
        if (!signedIn || OPEN_PATHS.some((p) => pathname?.startsWith(p))) return;
        let current = true;
        // supabase-js loads on first use, never on the first paint of a guest page (F-111).
        void loadBrowserClient()
            .then((supabase) => needsSecondFactor(supabase))
            .then((needed) => {
                if (current && needed) router.replace(`/login?mfa=1&redirect=${encodeURIComponent(pathname ?? '/')}`);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, [signedIn, pathname, router]);

    return null;
}
