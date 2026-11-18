import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { GameNotice } from '@/features/game/components/StatusBanners';

const SWORDS = 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2';

interface ChallengeStatusProps {
    opponentUsername: string;
    sending: boolean;
    sent: boolean;
    declined: boolean;
    signedIn: boolean;
    onSend: () => void;
}

/** Declined / waiting notices (the game screen's notice row) and the send button. */
export function ChallengeStatus({ opponentUsername, sending, sent, declined, signedIn, onSend }: ChallengeStatusProps) {
    const waiting = sent && !declined;
    return (
        <div className="flex flex-col gap-3 border-t-1 border-line px-7 py-5">
            {declined && <GameNotice tone="danger">{opponentUsername} declined the challenge.</GameNotice>}
            {waiting && (
                <GameNotice tone="accent">Challenge sent! Waiting for {opponentUsername} to accept…</GameNotice>
            )}
            <Button
                size="xl"
                className="w-full font-bold disabled:cursor-default disabled:opacity-50"
                onClick={onSend}
                disabled={sending || waiting || !signedIn}
            >
                {sending ? (
                    <Spinner size="sm" className="border-transparent border-t-on-accent" />
                ) : (
                    <Icon path={SWORDS} />
                )}
                {waiting ? 'Challenge Sent…' : 'Send Challenge'}
            </Button>
        </div>
    );
}
