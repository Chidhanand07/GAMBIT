import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/design/cn';
import type { LiveGame, LiveGamePlayer } from '@/types/liveGame';
import { liveGameLabel } from '../lobbyModel';

function PlayerLine({ player, swatch }: { player: LiveGamePlayer; swatch: string }) {
    return (
        <span className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('h-[10px] w-[10px] rounded-3', swatch)} />
            <span className="min-w-0 flex-1 font-semibold">{player.username}</span>
            <span className="font-mono text-[13px] text-ink-muted">{player.rating ?? '—'}</span>
        </span>
    );
}

/** One live game: LIVE, time control and move, both players with ratings, Watch. */
export function LiveGameItem({ game }: { game: LiveGame }) {
    return (
        <div className="flex flex-col gap-[10px] rounded-14 border-1 border-line-subtle bg-bg-base p-[14px]">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-success-ink">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
                    LIVE
                </span>
                <span className="font-mono text-[12px] text-ink-muted">
                    {liveGameLabel(game.category, game.time_control)} · move {game.move_number}
                </span>
            </div>
            <div className="flex flex-col gap-1">
                <PlayerLine player={game.white} swatch="bg-ink" />
                <PlayerLine player={game.black} swatch="box-content border-1 border-line-muted bg-on-accent" />
            </div>
            <div className="flex items-center justify-end gap-2">
                {typeof game.watching === 'number' && (
                    <span className="mr-auto text-[13px] text-ink-muted">{game.watching} watching</span>
                )}
                <Button
                    href={`/game/${game.id}`}
                    variant="outline"
                    size="sm"
                    aria-label={`Watch ${game.white.username} vs ${game.black.username}`}
                    className="box-content flex px-[18px]"
                >
                    Watch
                </Button>
            </div>
        </div>
    );
}
