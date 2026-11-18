import { Card } from '@/components/ui/Card';
import type { OpeningStat } from '@/types/profilePage';
import { openingRateTone } from '../model';
import { PANEL, PANEL_TITLE } from './styles';

const HEAD = 'text-[12px] text-ink-muted';
const TONE_CLASS = { good: 'text-success', even: 'text-ink', poor: 'text-danger' } as const;

/** "Openings" (Profile.dc.html): games, win rate and average accuracy per opening (F-123). */
export function OpeningsCard({ openings }: { openings: OpeningStat[] }) {
    return (
        <Card className={PANEL}>
            <span className={PANEL_TITLE}>Openings</span>
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-5 gap-y-[10px] text-[14px]">
                <span className={HEAD}>Opening</span>
                <span className={HEAD}>Games</span>
                <span className={HEAD}>Win rate</span>
                <span className={HEAD}>Avg accuracy</span>
                {openings.map((o) => (
                    <OpeningRow key={o.name} opening={o} />
                ))}
            </div>
        </Card>
    );
}

function OpeningRow({ opening: o }: { opening: OpeningStat }) {
    return (
        <>
            <span className="font-semibold">{o.name}</span>
            <span className="font-mono">{o.games}</span>
            <span className={`font-mono ${TONE_CLASS[openingRateTone(o.winRate)]}`}>{o.winRate}%</span>
            <span className="font-mono text-ink-muted">{o.accuracy === null ? '—' : `${o.accuracy}%`}</span>
        </>
    );
}
