'use client';

import { use } from 'react';
import { FriendsTab } from '@/features/profile/components/FriendsTab';
import { GamesTab } from '@/features/profile/components/GamesTab';
import { OverviewTab } from '@/features/profile/components/OverviewTab';
import { ProfileActions } from '@/features/profile/components/ProfileActions';
import { ProfileHeader } from '@/features/profile/components/ProfileHeader';
import { ProfileUnavailable } from '@/features/profile/components/ProfileUnavailable';
import { ProfileTabBar } from '@/features/profile/components/ProfileTabBar';
import { StatsTab } from '@/features/profile/components/StatsTab';
import { profileRecord } from '@/features/profile/format';
import { useFriends } from '@/features/profile/hooks/useFriends';
import { useFriendStatus } from '@/features/profile/hooks/useFriendStatus';
import { useGameHistory } from '@/features/profile/hooks/useGameHistory';
import { useProfileData } from '@/features/profile/hooks/useProfileData';
import { useProfilePresence } from '@/features/profile/hooks/useProfilePresence';
import { useProfileStats } from '@/features/profile/hooks/useProfileStats';
import { useProfileTab } from '@/features/profile/hooks/useProfileTab';

/**
 * Public profile page. The hooks below are called in the same order as the
 * effects of the pre-split page, so their effects still run in that order.
 */
export default function ProfilePage(props: { params: Promise<{ username: string }> }) {
    const params = use(props.params);
    const username = params.username;
    const { activeTab, setActiveTab } = useProfileTab();
    const { status, profile, meProfile, isOwnProfile, reload } = useProfileData(username);
    const { friendStatus, addFriend } = useFriendStatus({ username, profile, meProfile, isOwnProfile });
    const gameHistory = useGameHistory({ username, activeTab, profile });
    const statsState = useProfileStats({ username, activeTab, profile });
    const friendsState = useFriends({ activeTab, profile, isOwnProfile });
    const isOnline = useProfilePresence(profile?.id);

    if (!profile) return <ProfileUnavailable status={status} username={username} onRetry={reload} />;

    const record = profileRecord(profile);

    return (
        <div className="max-w-[1100px] mx-auto px-0 md:px-0">
            <ProfileHeader
                profile={profile}
                isOnline={isOnline}
                gamesPlayed={record.gamesPlayed}
                actions={
                    <ProfileActions
                        username={username}
                        isOwnProfile={isOwnProfile}
                        friendStatus={friendStatus}
                        onAddFriend={addFriend}
                    />
                }
            />

            <ProfileTabBar activeTab={activeTab} gamesPlayed={record.gamesPlayed} onSelect={setActiveTab} />

            <div className="px-4 md:px-6 pt-6 pb-12 space-y-6">
                {activeTab === 'overview' && (
                    <OverviewTab
                        username={username}
                        profile={profile}
                        record={record}
                        onViewAllGames={() => setActiveTab('games')}
                    />
                )}
                {activeTab === 'games' && (
                    <GamesTab
                        profile={profile}
                        games={gameHistory.games}
                        gamesLoading={gameHistory.gamesLoading}
                        hasMoreGames={gameHistory.hasMoreGames}
                        onLoadMore={gameHistory.loadMore}
                    />
                )}
                {activeTab === 'stats' && (
                    <StatsTab stats={statsState.stats} failed={statsState.failed} onRetry={statsState.retry} />
                )}
                {activeTab === 'friends' && (
                    <FriendsTab profile={profile} isOwnProfile={isOwnProfile} friendsState={friendsState} />
                )}
            </div>
        </div>
    );
}
