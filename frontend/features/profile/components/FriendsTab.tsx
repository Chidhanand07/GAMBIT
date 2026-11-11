import type { Profile } from '@/types/profile';
import type { useFriends } from '../hooks/useFriends';
import { FriendsListCard } from './FriendsListCard';
import { PendingRequestsCard } from './PendingRequestsCard';

interface FriendsTabProps {
    profile: Pick<Profile, 'username' | 'display_name'>;
    isOwnProfile: boolean;
    friendsState: ReturnType<typeof useFriends>;
}

/** Friends tab: pending requests (own profile only) above the friends list. */
export function FriendsTab({ profile, isOwnProfile, friendsState: s }: FriendsTabProps) {
    return (
        <div className="space-y-4">
            {isOwnProfile && (
                <PendingRequestsCard
                    pendingRequests={s.pendingRequests}
                    pendingLoading={s.pendingLoading}
                    onRespond={s.respondToRequest}
                />
            )}
            <FriendsListCard
                title={isOwnProfile ? 'My Friends' : `${profile.display_name || profile.username}'s Friends`}
                friends={s.friends}
                friendsLoading={s.friendsLoading}
                friendSearch={s.friendSearch}
                onSearchChange={s.setFriendSearch}
                isOwnProfile={isOwnProfile}
            />
        </div>
    );
}
