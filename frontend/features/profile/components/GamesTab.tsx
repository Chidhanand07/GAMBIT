import type { Profile } from '@/types/profile';
import type { ProfileGameRow } from '@/types/profilePage';
import { GameHistoryRow } from './GameHistoryRow';

interface GamesTabProps {
    profile: Pick<Profile, 'id' | 'username' | 'display_name'>;
    games: ProfileGameRow[];
    gamesLoading: boolean;
    hasMoreGames: boolean;
    onLoadMore: () => void;
}

/** Full games table with a spinner, an empty state and "Load more games" pagination. */
export function GamesTab({ profile, games, gamesLoading, hasMoreGames, onLoadMore }: GamesTabProps) {
    return (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_80px_100px_80px] gap-0 border-b border-border bg-elevated px-4 py-2.5 text-xs uppercase tracking-wider text-text-tertiary font-medium hidden md:grid">
                <span>Players</span>
                <span className="text-center">Result</span>
                <span className="text-center">Accuracy</span>
                <span className="text-center">Date</span>
                <span></span>
            </div>
            <div className="divide-y divide-border/50">
                {games.map((game, i) => (
                    <GameHistoryRow key={game.id} game={game} profile={profile} striped={i % 2 === 1} />
                ))}
            </div>
            {games.length === 0 && !gamesLoading && (
                <div className="py-16 text-center text-text-tertiary">No completed games yet.</div>
            )}
            {gamesLoading && (
                <div className="py-8 flex justify-center">
                    <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
            )}
            {hasMoreGames && !gamesLoading && games.length > 0 && (
                <div className="px-5 py-4 border-t border-border">
                    <button
                        onClick={onLoadMore}
                        className="w-full py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
                    >
                        Load more games
                    </button>
                </div>
            )}
        </div>
    );
}
