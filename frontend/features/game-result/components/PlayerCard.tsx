import { CLASS_META, CLASS_ORDER, estRating, type ClassificationCounts } from '../review';

interface PlayerCardProps {
    name: string;
    color: 'White' | 'Black';
    accuracy: number | null | undefined;
    rating: number | null | undefined;
    counts: ClassificationCounts;
}

export function PlayerCard({ name, color, accuracy, rating, counts }: PlayerCardProps) {
    const acc = typeof accuracy === 'number' ? accuracy : null;
    return (
        <div className="bg-surface border border-border rounded-xl p-5 h-fit">
            <div className="flex items-center gap-2 mb-4">
                <span
                    className="text-2xl"
                    style={{
                        color: color === 'White' ? '#fff' : '#111',
                        WebkitTextStroke: color === 'White' ? '1px #000' : undefined,
                    }}
                >
                    {color === 'White' ? '♔' : '♚'}
                </span>
                <div>
                    <div className="font-medium text-text-primary">{name}</div>
                    <div className="text-xs text-text-tertiary">
                        {color}
                        {rating ? ` · ${Math.round(rating)}` : ''}
                    </div>
                </div>
            </div>
            <div className="text-center mb-4">
                <div className="text-4xl font-bold text-accent tabular-nums">
                    {acc != null ? acc.toFixed(1) : '—'}
                    <span className="text-lg">%</span>
                </div>
                <div className="text-xs text-text-tertiary uppercase tracking-wide mt-1">Accuracy</div>
                {estRating(acc) != null && (
                    <div className="text-xs text-text-secondary mt-1">Est. performance ~{estRating(acc)}</div>
                )}
            </div>
            <div className="space-y-1.5">
                {CLASS_ORDER.filter((c) => counts[c]).map((c) => (
                    <div key={c} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ background: CLASS_META[c].color }}
                            >
                                {CLASS_META[c].sym}
                            </span>
                            <span className="text-text-secondary">{CLASS_META[c].label}</span>
                        </span>
                        <span className="text-text-primary tabular-nums">{counts[c]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
