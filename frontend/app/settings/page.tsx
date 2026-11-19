'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/components/ProfileProvider';
import { SettingsScreen } from '@/features/settings/components/SettingsScreen';
import { useSettingsPage } from '@/features/settings/hooks/useSettingsPage';

/** Settings (design/Settings.dc.html): public profile, board, gameplay and account, with a live preview. */
export default function SettingsPage() {
    const router = useRouter();
    const { profile, loading, refetch } = useProfile();
    const state = useSettingsPage(profile, refetch);
    const signedOut = !loading && !profile;

    // Navigation is a side effect: never call router.push while rendering (F17).
    useEffect(() => {
        if (signedOut) router.push('/login');
    }, [signedOut, router]);

    if (loading) {
        return (
            <div role="status" className="p-20 text-center text-ink-muted">
                Loading settings…
            </div>
        );
    }
    if (!profile) return null;
    return <SettingsScreen profile={profile} state={state} />;
}
