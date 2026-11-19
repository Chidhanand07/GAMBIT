'use client';

import { use } from 'react';
import { ProfileScreen } from '@/features/profile/components/ProfileScreen';
import { ProfileUnavailable } from '@/features/profile/components/ProfileUnavailable';
import { useProfilePage } from '@/features/profile/hooks/useProfilePage';

/** Public profile page (design/Profile.dc.html): Overview / Games / Stats / Friends. */
export default function ProfilePage(props: { params: Promise<{ username: string }> }) {
    const { username } = use(props.params);
    const state = useProfilePage(username);
    if (!state.profile) return <ProfileUnavailable status={state.status} username={username} onRetry={state.reload} />;
    return <ProfileScreen state={state} profile={state.profile} />;
}
