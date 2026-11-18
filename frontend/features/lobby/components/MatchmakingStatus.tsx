import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatClock } from '@/lib/chess/clock';

interface MatchmakingStatusProps {
    /** "Blitz", "Custom", … */
    timeControlName: string;
    /** Seconds since the search started. */
    elapsed: number;
    onCancel: () => void;
}

/** "Finding an opponent..." with the real time spent in the queue. */
export function MatchmakingStatus({ timeControlName, elapsed, onCancel }: MatchmakingStatusProps) {
    return (
        <Card className="flex flex-wrap items-center justify-between gap-4">
            <div role="status" className="flex flex-col">
                <span className="font-display text-[22px] font-bold">Finding an opponent...</span>
                <span className="text-[14px] text-ink-muted">
                    {timeControlName} · <span className="tabular-nums">{formatClock(elapsed)}</span>
                </span>
            </div>
            <Button variant="outline" size="lg" onClick={onCancel}>
                Cancel
            </Button>
        </Card>
    );
}
