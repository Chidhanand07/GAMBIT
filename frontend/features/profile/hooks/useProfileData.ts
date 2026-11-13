import { useCallback, useEffect, useState } from 'react';
import { fetchMyProfile, fetchProfile } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';

const HTTP_NOT_FOUND = 404;

/** 'not-found': the API answered 404. 'error': any other failure (status or network). */
export type ProfileLoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

interface ProfileDataState {
    status: ProfileLoadStatus;
    profile: Profile | null;
    meProfile: Profile | null;
}

const LOADING: ProfileDataState = { status: 'loading', profile: null, meProfile: null };

async function loadProfileData(username: string): Promise<ProfileDataState> {
    const [profileRes, meRes] = await Promise.all([fetchProfile(username), fetchMyProfile().catch(() => null)]);
    if (!profileRes.ok) {
        const status = profileRes.status === HTTP_NOT_FOUND ? 'not-found' : 'error';
        return { status, profile: null, meProfile: null };
    }
    const profile = await profileRes.json();
    const meProfile = meRes?.ok ? await meRes.json() : null;
    return { status: 'ready', profile, meProfile };
}

/**
 * Loads the viewed profile and the viewer's own profile in parallel whenever
 * `username` changes (or `reload` is called). A 404 is a not-found state, any
 * other failure an error state the page can retry (F12); a non-OK /me
 * response means a signed-out viewer.
 */
export function useProfileData(username: string) {
    const [state, setState] = useState<ProfileDataState>(LOADING);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        void loadProfileData(username)
            .catch((): ProfileDataState => ({ status: 'error', profile: null, meProfile: null }))
            .then((next) => {
                if (current) setState(next);
            });
        return () => {
            current = false;
        };
    }, [username, attempt]);

    const reload = useCallback(() => {
        setState(LOADING);
        setAttempt((n) => n + 1);
    }, []);

    const { status, profile, meProfile } = state;
    const isOwnProfile = profile !== null && meProfile?.id === profile.id;
    return { status, profile, meProfile, isOwnProfile, reload };
}
