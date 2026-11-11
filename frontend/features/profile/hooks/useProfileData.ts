import { useEffect, useState } from 'react';
import { fetchMyProfile, fetchProfile } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';

/**
 * Loads the viewed profile and the viewer's own profile in parallel whenever
 * `username` changes. A non-OK profile response leaves `profile` null (the page
 * keeps its spinner); a non-OK /me response means a signed-out viewer.
 */
export function useProfileData(username: string) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [meProfile, setMeProfile] = useState<Profile | null>(null);
    const [isOwnProfile, setIsOwnProfile] = useState(false);

    useEffect(() => {
        const loadProfile = async () => {
            const [profileRes, meRes] = await Promise.all([fetchProfile(username), fetchMyProfile()]);
            if (!profileRes.ok) return;
            const data = await profileRes.json();
            const me = meRes.ok ? await meRes.json() : null;
            setProfile(data);
            setMeProfile(me);
            setIsOwnProfile(me?.id === data.id);
        };
        // Errors stay unhandled exactly as before the split (fire-and-forget).
        void loadProfile();
    }, [username]);

    return { profile, meProfile, isOwnProfile };
}
