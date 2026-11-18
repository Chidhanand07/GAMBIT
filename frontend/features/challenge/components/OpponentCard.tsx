import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import type { ChallengeOpponent } from '../types';

const DEFAULT_RATING = 1200;

/** The player being challenged: avatar, name and handle with the rapid rating (Profile row style). */
export function OpponentCard({ opponent }: { opponent: ChallengeOpponent }) {
    const name = opponent.display_name || opponent.username;
    return (
        <div className="flex flex-col gap-2 px-7 pb-5 pt-[22px]">
            <span className="text-[13px] font-semibold text-ink-muted">Opponent</span>
            <Link href={`/profile/${opponent.username}`} className="flex items-center gap-[14px] no-underline">
                <Avatar name={name} src={opponent.avatar_url} size="md" tone="surface" />
                <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{name}</span>
                    <span className="font-mono text-[13px] text-ink-muted">
                        @{opponent.username} · {Math.round(opponent.rating_rapid ?? DEFAULT_RATING)} Rapid
                    </span>
                </span>
            </Link>
        </div>
    );
}
