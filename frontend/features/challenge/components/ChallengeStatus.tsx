import { Loader2, Swords } from 'lucide-react';

interface ChallengeStatusProps {
    opponentUsername: string;
    sending: boolean;
    sent: boolean;
    declined: boolean;
    signedIn: boolean;
    onSend: () => void;
}

/** Declined / waiting banners and the send button. */
export function ChallengeStatus({ opponentUsername, sending, sent, declined, signedIn, onSend }: ChallengeStatusProps) {
    const waiting = sent && !declined;
    return (
        <>
            {declined && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                    {opponentUsername} declined the challenge.
                </div>
            )}

            {waiting && (
                <div className="px-4 py-3 bg-accent/10 border border-accent/30 rounded-lg text-accent text-sm text-center">
                    Challenge sent! Waiting for {opponentUsername} to accept…
                </div>
            )}

            <button
                onClick={onSend}
                disabled={sending || waiting || !signedIn}
                className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-surface font-bold text-base rounded-xl transition-colors flex items-center justify-center gap-2"
            >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} strokeWidth={1.5} />}
                {waiting ? 'Challenge Sent…' : 'Send Challenge'}
            </button>
        </>
    );
}
