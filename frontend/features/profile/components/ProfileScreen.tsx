import type { ReactNode } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import type { Profile } from '@/types/profile';
import type { ProfilePageState } from '../hooks/useProfilePage';
import { aboutFacts, achievements } from '../model';
import type { ProfileTab } from '../types';
import { FriendsTab } from './FriendsTab';
import { GamesTab } from './GamesTab';
import { OverviewTab } from './OverviewTab';
import { ProfileActions } from './ProfileActions';
import { ProfileHero } from './ProfileHero';
import { RatingCard } from './RatingCard';
import { StatsTab } from './StatsTab';

/** The page column of Profile.dc.html: 1040px wide, 24px between sections. */
export function ProfileShell({ children }: { children: ReactNode }) {
    return <div className="mx-auto box-border flex max-w-[1040px] flex-col gap-6 px-8 pb-[72px] pt-9">{children}</div>;
}

function tabItems(gamesPlayed: number): { id: ProfileTab; label: string }[] {
    return [
        { id: 'overview', label: 'Overview' },
        { id: 'games', label: gamesPlayed > 0 ? `Games (${gamesPlayed})` : 'Games' },
        { id: 'stats', label: 'Stats' },
        { id: 'friends', label: 'Friends' },
    ];
}

/** The rounded rating, or null when the column is empty. */
function roundedRating(value: number | null | undefined): number | null {
    return typeof value === 'number' ? Math.round(value) : null;
}

function ActiveTab({ s, profile }: { s: ProfilePageState; profile: Profile }) {
    const record = s.record ?? { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };
    switch (s.activeTab) {
        case 'games':
            return (
                <GamesTab
                    profileId={profile.id}
                    total={record.gamesPlayed}
                    games={s.history.games}
                    shown={s.shownGames}
                    filter={s.filter}
                    onFilter={s.setFilter}
                    loading={s.history.gamesLoading}
                    hasMore={s.history.hasMoreGames}
                    onLoadMore={s.history.loadMore}
                />
            );
        case 'stats':
            return (
                <StatsTab
                    stats={s.stats.stats}
                    failed={s.stats.failed}
                    onRetry={s.stats.retry}
                    rating={
                        <RatingCard
                            mode={s.mode}
                            onMode={s.setMode}
                            rating={roundedRating(profile[`rating_${s.mode}`])}
                            history={s.stats.stats?.ratingHistory?.[s.mode] ?? null}
                        />
                    }
                />
            );
        case 'friends':
            return (
                <FriendsTab
                    isOwnProfile={s.isOwnProfile}
                    ownerName={profile.display_name || profile.username}
                    friends={s.friends.friends}
                    friendsLoading={s.friends.friendsLoading}
                    pendingRequests={s.friends.pendingRequests}
                    pendingLoading={s.friends.pendingLoading}
                    respondError={s.friends.respondError}
                    onRespond={(id, action) => void s.friends.respondToRequest(id, action)}
                    search={s.friends.friendSearch}
                    onSearch={s.friends.setFriendSearch}
                />
            );
        default:
            return (
                <OverviewTab
                    profileId={profile.id}
                    facts={aboutFacts(profile)}
                    badges={achievements(record, s.stats.stats)}
                    friends={s.friends.friends}
                    onlineIds={s.onlineIds}
                    recentGames={s.recent.games}
                    recentLoading={s.recent.loading}
                    onSeeFriends={() => s.setActiveTab('friends')}
                    onViewAllGames={() => s.setActiveTab('games')}
                />
            );
    }
}

/** Hero, section tabs and the active tab of a loaded profile. */
export function ProfileScreen({ state: s, profile }: { state: ProfilePageState; profile: Profile }) {
    const gamesPlayed = s.record?.gamesPlayed ?? 0;
    return (
        <ProfileShell>
            <ProfileHero
                profile={profile}
                isOnline={s.isOnline}
                gamesPlayed={gamesPlayed}
                actions={
                    <ProfileActions
                        username={profile.username}
                        isOwnProfile={s.isOwnProfile}
                        friendStatus={s.friendStatus.friendStatus}
                        onAddFriend={() => void s.friendStatus.addFriend()}
                    />
                }
            />
            <Tabs
                label="Profile sections"
                items={tabItems(gamesPlayed)}
                value={s.activeTab}
                onChange={s.setActiveTab}
                className="self-start"
            />
            <ActiveTab s={s} profile={profile} />
        </ProfileShell>
    );
}
