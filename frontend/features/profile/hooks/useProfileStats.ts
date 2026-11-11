import { useEffect, useState } from 'react';
import { fetchProfileStats } from '@/lib/api/profile';
import type { Profile } from '@/types/profile';
import type { ProfileStats } from '@/types/profilePage';
import type { ProfileTab } from '../types';

interface ProfileStatsArgs {
    username: string;
    activeTab: ProfileTab;
    profile: Profile | null;
}

/** Stats tab data, fetched the first time the tab is shown and then kept. */
export function useProfileStats({ username, activeTab, profile }: ProfileStatsArgs) {
    const [statsData, setStatsData] = useState<ProfileStats | null>(null);

    // Re-runs only on tab or profile-id change (legacy dependency list, kept on purpose).
    useEffect(() => {
        if (activeTab === 'stats' && !statsData && profile) {
            // LEGACY: no .catch — a rejected fetch is an unhandled rejection, as before.
            void fetchProfileStats(username)
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                    if (d) setStatsData(d);
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: legacy deps [activeTab, profile?.id]
    }, [activeTab, profile?.id]);

    return statsData;
}
