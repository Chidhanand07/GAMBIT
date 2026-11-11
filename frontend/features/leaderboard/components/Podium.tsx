import Link from 'next/link';
import { Crown } from 'lucide-react';
import type { RatingField } from '@/types/timeControl';
import { ratingOf, type LeaderboardPlayer } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32'];
/** Display order left→right is 2nd, 1st, 3rd; these are the 0-based ranks per slot. */
const PODIUM_RANKS = [1, 0, 2];

function PodiumCard({
    player: p,
    rank,
    ratingField,
}: {
    player: LeaderboardPlayer;
    rank: number;
    ratingField: RatingField;
}) {
    const isFirst = rank === 0;
    return (
        <Link
            href={`/profile/${p.username}`}
            className="rounded-xl p-4 text-center flex flex-col items-center gap-2 transition-all hover:brightness-110"
            style={{
                background: isFirst
                    ? 'linear-gradient(180deg,var(--accent-dim),var(--bg-surface))'
                    : 'var(--bg-surface)',
                border: isFirst ? '1.5px solid var(--border-accent)' : '0.5px solid var(--border-strong)',
                paddingTop: isFirst ? '1.5rem' : '1rem',
            }}
        >
            {isFirst && <Crown size={18} className="text-accent" strokeWidth={1.5} />}
            <PlayerAvatar player={p} size={isFirst ? 52 : 44} />
            <div className="min-w-0 w-full">
                <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {p.display_name || p.username}
                </div>
                <div className="font-bold tabular-nums text-accent" style={{ fontSize: isFirst ? 22 : 18 }}>
                    {ratingOf(p, ratingField)}
                </div>
                <div className="text-xs mt-0.5 font-semibold" style={{ color: MEDAL[rank] }}>
                    #{rank + 1}
                </div>
            </div>
        </Link>
    );
}

/** Top-three podium; the caller renders it only when there are at least three players. */
export function Podium({ top3, ratingField }: { top3: LeaderboardPlayer[]; ratingField: RatingField }) {
    return (
        <div className="grid grid-cols-3 gap-3 mb-6">
            {PODIUM_RANKS.map((rank) => (
                <PodiumCard key={top3[rank].username} player={top3[rank]} rank={rank} ratingField={ratingField} />
            ))}
        </div>
    );
}
