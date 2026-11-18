import { useState } from 'react';
import type { SpeedBucket } from '@/types/timeControl';
import { profileRecord } from '../format';
import { filterGames, type GameFilter } from '../model';
import { useFriends } from './useFriends';
import { useFriendStatus } from './useFriendStatus';
import { useGameHistory } from './useGameHistory';
import { useProfileData } from './useProfileData';
import { usePresenceSets, useProfilePresence } from './useProfilePresence';
import { useProfileStats } from './useProfileStats';
import { useProfileTab } from './useProfileTab';
import { useRecentGames } from './useRecentGames';

/**
 * Everything the profile page shows, from the data hooks plus the page's own UI state (games
 * filter, rating mode). The hooks run in the same order as before the redesign, so their effects
 * still run in that order.
 */
export function useProfilePage(username: string) {
    const { activeTab, setActiveTab } = useProfileTab();
    const data = useProfileData(username);
    const { profile, meProfile, isOwnProfile } = data;
    const friendStatus = useFriendStatus({ username, profile, meProfile, isOwnProfile });
    const recent = useRecentGames(username, activeTab, profile?.id);
    const history = useGameHistory({ activeTab, profile });
    const stats = useProfileStats({ username, activeTab, profile });
    const friends = useFriends({ activeTab, profile, isOwnProfile });
    const isOnline = useProfilePresence(profile?.id);
    const presence = usePresenceSets();
    const [filter, setFilter] = useState<GameFilter>('All');
    const [mode, setMode] = useState<SpeedBucket>('blitz');

    const record = profile ? profileRecord(profile) : null;
    const shownGames = profile ? filterGames(history.games, filter, profile.id) : [];
    return {
        ...data,
        activeTab,
        setActiveTab,
        friendStatus,
        recent,
        history,
        stats,
        friends,
        isOnline,
        presence,
        filter,
        setFilter,
        shownGames,
        mode,
        setMode,
        record,
    };
}

export type ProfilePageState = ReturnType<typeof useProfilePage>;
