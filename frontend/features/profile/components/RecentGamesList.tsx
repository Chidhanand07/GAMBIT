import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchRecentGames } from '@/lib/api/profile';
import { displayTimeControl } from '@/lib/chess/timeControl';
import type { ProfileGameRow } from '@/types/profilePage';
import type { PlayerOutcome } from '@/lib/chess/gameOutcome';
import { formatDate, gameOutcome } from '../format';

const OUTCOME_TEXT: Record<PlayerOutcome, { label: string; className: string }> = {
    win: { label: 'Win', className: 'text-indicator-green' },
    loss: { label: 'Loss', className: 'text-red-400' },
    draw: { label: 'Draw', className: 'text-text-secondary' },
    aborted: { label: 'Aborted', className: 'text-text-tertiary' },
};

function RecentGameRow({ game, profileId }: { game: ProfileGameRow; profileId: string }) {
    const isWhite = game.white_id === profileId;
    const opp = isWhite ? game.black : game.white;
    const { label: result, className: resultClr } = OUTCOME_TEXT[gameOutcome(game, profileId)];
    return (
        <div className="flex items-center justify-between px-5 py-3 hover:bg-hover transition-colors">
            <div className="flex items-center gap-3">
                <span className={`text-xs font-medium w-8 ${resultClr}`}>{result}</span>
                {opp?.username ? (
                    <Link
                        href={`/profile/${opp.username}`}
                        className="text-text-secondary text-sm hover:text-accent transition-colors"
                    >
                        vs {opp.display_name || opp.username}
                    </Link>
                ) : (
                    <span className="text-text-secondary text-sm">vs Unknown</span>
                )}
                <span className="text-text-tertiary text-xs">{displayTimeControl(game.time_control)}</span>
            </div>
            <span className="text-text-tertiary text-xs">{formatDate(game.created_at)}</span>
        </div>
    );
}

/** Overview card body: the 5 most recent games, fetched on mount and whenever `username` changes. */
export function RecentGamesList({ username, profileId }: { username: string; profileId: string }) {
    const [games, setGames] = useState<ProfileGameRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRecentGames(username)
            .then((r) => (r.ok ? r.json() : { games: [] }))
            .then((d) => setGames(d.games ?? []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [username]);

    if (loading)
        return (
            <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
        );
    if (!games.length)
        return <div className="py-8 text-center text-text-tertiary text-sm">No completed games yet.</div>;

    return (
        <div className="divide-y divide-border/50">
            {games.map((game) => (
                <RecentGameRow key={game.id} game={game} profileId={profileId} />
            ))}
        </div>
    );
}
