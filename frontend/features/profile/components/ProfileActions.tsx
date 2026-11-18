import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { FriendStatus } from '../types';
import { challengeHref } from '../links';

const PEN = 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z';
/** The hero's 48px pill (Profile.dc.html "Edit profile"). */
const HERO_BUTTON = 'min-h-[48px] gap-2 px-5 text-[15px]';

interface FriendButtonProps {
    friendStatus: FriendStatus;
    onAddFriend: () => void;
}

function FriendButton({ friendStatus, onAddFriend }: FriendButtonProps) {
    if (friendStatus === 'loading') return null;
    if (friendStatus === 'friends' || friendStatus === 'pending_sent') {
        return (
            <Button variant="outline" className={`${HERO_BUTTON} cursor-default text-ink-muted`} disabled>
                {friendStatus === 'friends' ? 'Friends' : 'Request sent'}
            </Button>
        );
    }
    return (
        <Button variant="outline" className={HERO_BUTTON} onClick={onAddFriend}>
            Add friend
        </Button>
    );
}

interface ProfileActionsProps extends FriendButtonProps {
    username: string;
    isOwnProfile: boolean;
}

/** Hero actions: "Edit profile" (→ /settings) on your own profile, otherwise friend status + Challenge. */
export function ProfileActions({ username, isOwnProfile, friendStatus, onAddFriend }: ProfileActionsProps) {
    if (isOwnProfile) {
        return (
            <Button href="/settings" variant="outline" className={HERO_BUTTON}>
                <Icon path={PEN} />
                Edit profile
            </Button>
        );
    }
    return (
        <div className="flex flex-wrap gap-2">
            <FriendButton friendStatus={friendStatus} onAddFriend={onAddFriend} />
            <Button href={challengeHref(username)} className={HERO_BUTTON}>
                Challenge
            </Button>
        </div>
    );
}
