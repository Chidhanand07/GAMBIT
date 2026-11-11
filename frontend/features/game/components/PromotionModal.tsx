'use client';

const PROMO_PIECES = [
    { type: 'q', name: 'Queen' },
    { type: 'r', name: 'Rook' },
    { type: 'b', name: 'Bishop' },
    { type: 'n', name: 'Knight' },
] as const;

export default function PromotionModal({
    color,
    onSelect,
}: {
    color: 'white' | 'black';
    onSelect: (p: string) => void;
}) {
    const c = color === 'white' ? 'w' : 'b';
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
            <div className="bg-surface border border-border rounded-xl p-4 shadow-2xl">
                <div className="text-text-secondary text-xs uppercase tracking-wider text-center mb-3">
                    Choose promotion
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {PROMO_PIECES.map((p) => (
                        <button
                            key={p.type}
                            onClick={() => onSelect(p.type)}
                            className="w-14 h-14 flex flex-col items-center justify-center rounded-lg bg-elevated border border-border hover:border-accent hover:bg-accent/10 transition-all group"
                        >
                            <img
                                src={`/pieces/classic/${c}${p.type}.png`}
                                alt={p.name}
                                className="w-9 h-9 object-contain"
                                draggable={false}
                                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}
                            />
                            <span className="text-[10px] text-text-tertiary group-hover:text-accent mt-0.5">
                                {p.name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
