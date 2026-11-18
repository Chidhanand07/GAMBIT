import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { LobbyFriend } from '../types';
import { FriendRow } from './FriendRow';
import { StagePanelHeader } from './StagePanelHeader';

interface FriendsChallengeProps {
    /** null while the list is loading. */
    friends: LobbyFriend[] | null;
    timeControlName: string;
    onInviteLink: () => void;
    onClose: () => void;
}

/** "Play a friend": accepted friends with presence, plus an invite link for anyone else. */
export function FriendsChallenge({ friends, timeControlName, onInviteLink, onClose }: FriendsChallengeProps) {
    return (
        <Card className="flex flex-col gap-3">
            <StagePanelHeader
                title="Play a friend"
                subtitle={`Challenge someone for a ${timeControlName} game.`}
                onClose={onClose}
            />
            {friends?.map((f) => (
                <FriendRow key={f.username} friend={f} />
            ))}
            {friends?.length === 0 && <span className="text-[14px] text-ink-muted">No friends yet.</span>}
            <Button variant="outline" onClick={onInviteLink} className="self-start">
                Invite with a link
            </Button>
        </Card>
    );
}
