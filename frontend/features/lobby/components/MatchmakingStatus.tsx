import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatClock } from '@/lib/chess/clock';
import type { SearchWindow } from '@/types/socket';

interface MatchmakingStatusProps {
    /** "Blitz", "Custom", … */
    timeControlName: string;
    /** Seconds since the search started. */
    elapsed: number;
    /** The server's current rating window; null until it has said. */
    searchWindow: SearchWindow | null;
    onCancel: () => void;
}

/** "rating range 925 to 1125" (Main.dc.html), "any rating" once the search is open to everyone. */
export function windowText(w: SearchWindow): string {
    return w.min === null ? 'any rating' : `rating range ${w.min} to ${w.max}`;
}

/** "Finding an opponent..." with the real rating range and time spent in the queue. */
export function MatchmakingStatus({ timeControlName, elapsed, searchWindow, onCancel }: MatchmakingStatusProps) {
    return (
        <Card className="flex flex-wrap items-center justify-between gap-4">
            <div role="status" className="flex flex-col">
                <span className="font-display text-[22px] font-bold">Finding an opponent...</span>
                <span className="text-[14px] text-ink-muted">
                    {timeControlName} · {searchWindow && `${windowText(searchWindow)} · `}
                    <span className="tabular-nums">{formatClock(elapsed)}</span>
                </span>
            </div>
            <Button variant="outline" size="lg" onClick={onCancel}>
                Cancel
            </Button>
        </Card>
    );
}
