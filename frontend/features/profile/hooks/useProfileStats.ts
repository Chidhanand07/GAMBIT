import { useCallback, useEffect, useState } from 'react';
import { fetchProfileStats } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';
import type { ProfileStats } from '@/types/profilePage';
import type { ProfileTab } from '../types';

interface ProfileStatsArgs {
    username: string;
    activeTab: ProfileTab;
    profile: Profile | null;
}

interface StatsResult {
    profileId: string;
    stats: ProfileStats | null;
    failed: boolean;
}

async function loadStats(username: string): Promise<ProfileStats> {
    const res = await fetchProfileStats(username);
    if (!res.ok) throw new Error(`stats request failed: ${res.status}`);
    return res.json();
}

/**
 * Stats tab data, fetched the first time the tab is shown for a profile and
 * then kept. A failed request (status or network) becomes `failed`, which the
 * tab shows with a Retry button instead of an endless spinner (F12).
 */
export function useProfileStats({ username, activeTab, profile }: ProfileStatsArgs) {
    const [result, setResult] = useState<StatsResult | null>(null);
    const [attempt, setAttempt] = useState(0);
    const profileId = profile?.id;
    const own = result !== null && result.profileId === profileId ? result : null;
    const loaded = own?.stats != null;

    useEffect(() => {
        if (activeTab !== 'stats' || !profileId || loaded) return;
        let current = true;
        void loadStats(username)
            .then((stats) => ({ profileId, stats, failed: false }))
            .catch(() => ({ profileId, stats: null, failed: true }))
            .then((next) => {
                if (current) setResult(next);
            });
        return () => {
            current = false;
        };
    }, [activeTab, profileId, username, loaded, attempt]);

    const retry = useCallback(() => {
        setResult(null);
        setAttempt((n) => n + 1);
    }, []);

    return { stats: own?.stats ?? null, failed: own?.failed ?? false, retry };
}
