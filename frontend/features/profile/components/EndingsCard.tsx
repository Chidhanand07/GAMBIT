import { Card } from '@/components/ui/Card';
import type { EndingRow } from '../model';
import { PANEL, PANEL_TITLE } from './styles';

/** "How games end" (Profile.dc.html): a count and a gold bar per way a game ended (F-124). */
export function EndingsCard({ rows }: { rows: EndingRow[] }) {
    return (
        <Card className={`${PANEL} flex-[1_1_300px]`}>
            <span className={PANEL_TITLE}>How games end</span>
            {rows.map((e) => (
                <div key={e.name} className="flex flex-col gap-[5px]">
                    <div className="flex justify-between text-[14px]">
                        <span>{e.name}</span>
                        <span className="font-mono text-ink-muted">{e.n}</span>
                    </div>
                    <div aria-hidden="true" className="h-[6px] rounded-pill bg-bg-base">
                        <div className="h-full rounded-pill bg-accent" style={{ width: e.pct }} />
                    </div>
                </div>
            ))}
        </Card>
    );
}
