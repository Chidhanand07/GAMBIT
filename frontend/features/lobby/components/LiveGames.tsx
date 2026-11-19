import { Card } from '@/components/ui/Card';
import type { LiveGame } from '@/types/liveGame';
import { LiveGameItem } from './LiveGameItem';

/** "Live games": active public games, newest first. */
export function LiveGames({ games }: { games: LiveGame[] }) {
    return (
        <Card as="div" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 font-display text-[18px] font-semibold leading-[1.5]">Live games</h2>
                <span className="font-mono text-[13px] font-medium text-ink-muted">{games.length} now</span>
            </div>
            {games.map((g) => (
                <LiveGameItem key={g.id} game={g} />
            ))}
            {games.length === 0 && <span className="text-[14px] text-ink-muted">No live games right now.</span>}
        </Card>
    );
}
