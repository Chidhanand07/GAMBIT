import { cn } from '@/lib/design/cn';
import type { ChallengePolicy, PrivacyPrefs } from '@/types/preferences';
import { PreviewCard } from './PreviewCard';
import { ProfileAvatar } from './ProfileAvatar';

const CHALLENGE_TEXT: Record<ChallengePolicy, string> = {
    everyone: 'Challenge',
    friends: 'Friends only',
    nobody: 'Not accepting',
};

interface Props {
    prefs: PrivacyPrefs;
    /** Display name, or the username when there is none. */
    name: string;
    avatarUrl: string | null;
    /** Current rapid rating (rounded). */
    rating: number;
    /** Place on the rapid leaderboard, when in the top 50. */
    rank: number | null;
}

function leaderboardText(listed: boolean, rank: number | null, rating: number): string {
    if (!listed) return 'Not listed';
    return rank ? `#${rank} · ${rating}` : `Listed · ${rating}`;
}

/** How other players see you with the draft's privacy settings. */
export function PrivacyPreview({ prefs, name, avatarUrl, rating, rank }: Props) {
    const open = prefs.challengePolicy === 'everyone';
    return (
        <PreviewCard>
            <div className="flex items-center gap-3 rounded-14 border-1 border-line bg-bg-base p-[14px]">
                <ProfileAvatar name={name} src={avatarUrl} size={44} />
                <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold [overflow-wrap:anywhere]">{name}</span>
                    <span
                        className={cn(
                            'text-[13px] font-semibold',
                            prefs.showOnline ? 'text-success' : 'text-ink-muted',
                        )}
                    >
                        {prefs.showOnline ? 'Online' : 'Last seen recently'}
                    </span>
                </span>
            </div>
            <div className="flex flex-col gap-2 text-[14px]">
                <span className="flex justify-between gap-2">
                    <span className="text-ink-muted [overflow-wrap:anywhere]">Search for &quot;{name}&quot;</span>
                    <b>{prefs.appearInSearch ? 'Found' : 'Hidden'}</b>
                </span>
                <span className="flex justify-between gap-2">
                    <span className="text-ink-muted">Leaderboard</span>
                    <b>{leaderboardText(prefs.showOnLeaderboard, rank, rating)}</b>
                </span>
            </div>
            <div className="flex gap-2">
                <span
                    className={cn(
                        'flex min-h-[44px] flex-1 items-center justify-center rounded-pill text-[14px] font-bold',
                        open ? 'bg-accent text-on-accent' : 'bg-bg-base text-ink-muted',
                    )}
                >
                    {CHALLENGE_TEXT[prefs.challengePolicy]}
                </span>
                <span
                    className={cn(
                        'flex min-h-[44px] flex-1 items-center justify-center rounded-pill border-1.5 border-line-muted text-[14px] font-semibold text-ink',
                        !prefs.allowSpectators && 'opacity-45',
                    )}
                >
                    {prefs.allowSpectators ? 'Watch live' : 'Spectating off'}
                </span>
            </div>
        </PreviewCard>
    );
}
