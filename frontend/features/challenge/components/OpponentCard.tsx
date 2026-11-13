import Link from 'next/link';
import type { ChallengeOpponent } from '../types';
import { AvatarImage } from '@/components/ui/AvatarImage';

/** The avatar box is w-10. */
const OPPONENT_AVATAR_PX = 40;

const DEFAULT_RATING = 1200;

export function OpponentCard({ opponent }: { opponent: ChallengeOpponent }) {
    const name = opponent.display_name || opponent.username;
    return (
        <div className="px-5 py-4 border-b border-border bg-elevated">
            <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Opponent</p>
            <Link
                href={`/profile/${opponent.username}`}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
                <div className="w-10 h-10 rounded-full bg-page border border-border-strong flex items-center justify-center overflow-hidden shrink-0">
                    {opponent.avatar_url ? (
                        <AvatarImage src={opponent.avatar_url} size={OPPONENT_AVATAR_PX} />
                    ) : (
                        <span className="text-accent font-medium">{name[0].toUpperCase()}</span>
                    )}
                </div>
                <div>
                    <div className="text-text-primary font-medium">{name}</div>
                    <div className="text-text-tertiary text-xs">
                        @{opponent.username} · {Math.round(opponent.rating_rapid ?? DEFAULT_RATING)} Rapid
                    </div>
                </div>
            </Link>
        </div>
    );
}
