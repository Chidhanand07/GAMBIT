import type { LeaderboardPlayer } from '../types';
import { AvatarImage } from '@/components/ui/AvatarImage';

const INITIAL_FONT_RATIO = 0.38;

export function PlayerAvatar({ player, size = 36 }: { player: LeaderboardPlayer; size?: number }) {
    const initial = (player.display_name || player.username || '?')[0].toUpperCase();
    return (
        <div
            className="rounded-full flex items-center justify-center shrink-0 overflow-hidden font-semibold"
            style={{
                width: size,
                height: size,
                background: 'var(--accent-dim)',
                border: '1px solid var(--border-accent)',
                fontSize: size * INITIAL_FONT_RATIO,
                color: 'var(--accent)',
            }}
        >
            {player.avatar_url ? <AvatarImage src={player.avatar_url} size={size} className="object-cover" /> : initial}
        </div>
    );
}
