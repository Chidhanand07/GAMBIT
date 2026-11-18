import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/design/cn';
import { CLASS_META, CLASS_ORDER, estRating, type ClassificationCounts } from '../review';

interface PlayerCardProps {
    name: string;
    color: 'White' | 'Black';
    accuracy: number | null | undefined;
    rating: number | null | undefined;
    counts: ClassificationCounts;
}

/** One player's accuracy and move-classification counts, on the game screen's card surface. */
export function PlayerCard({ name, color, accuracy, rating, counts }: PlayerCardProps) {
    const acc = typeof accuracy === 'number' ? accuracy : null;
    const est = estRating(acc);
    return (
        <Card as="article" aria-label={`${color}: ${name}`} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <span
                    aria-hidden="true"
                    className={cn(
                        'box-content h-3 w-3 rounded-3 border-1 border-line-muted',
                        color === 'White' ? 'bg-ink' : 'bg-on-accent',
                    )}
                />
                <div className="flex flex-col">
                    <span className="text-[18px] font-bold">{name}</span>
                    <span className="text-[13px] text-ink-muted">
                        {color}
                        {rating ? ` · ${Math.round(rating)}` : ''}
                    </span>
                </div>
            </div>
            <div className="flex flex-col items-center rounded-14 border-1 border-line-subtle bg-bg-base px-[14px] py-3">
                <span className="font-mono text-[34px] font-bold text-accent">
                    {acc != null ? acc.toFixed(1) : '—'}
                    <span className="text-[18px]">%</span>
                </span>
                <span className="text-[13px] text-ink-faint">Accuracy</span>
                {est != null && <span className="text-[13px] text-ink-muted">Est. performance ~{est}</span>}
            </div>
            <div className="flex flex-col">
                {CLASS_ORDER.filter((c) => counts[c]).map((c) => (
                    <div
                        key={c}
                        className="flex items-center justify-between border-t-1 border-line-subtle py-[9px] text-[14px]"
                    >
                        <span className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-ink-bright"
                                style={{ background: CLASS_META[c].color }}
                            >
                                {CLASS_META[c].sym}
                            </span>
                            <span className="text-ink-muted">{CLASS_META[c].label}</span>
                        </span>
                        <span className="font-mono font-bold">{counts[c]}</span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
