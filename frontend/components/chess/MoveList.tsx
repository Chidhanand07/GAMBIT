import { cn } from '@/lib/design/cn';

interface MoveListProps {
    /** SAN moves in order, white first. */
    moves: readonly string[];
    /** Highlights this ply (0-based index into `moves`) when reviewing history. */
    currentPly?: number | null;
    /** Makes each move a button that jumps to its ply. */
    onSelectPly?: (ply: number) => void;
    title?: string;
    className?: string;
}

function MoveCell({
    san,
    ply,
    current,
    onSelect,
}: {
    san?: string;
    ply: number;
    current: boolean;
    onSelect?: (ply: number) => void;
}) {
    if (!san) return <span />;
    const tone = current ? 'text-accent' : 'text-ink';
    if (!onSelect) return <span className={tone}>{san}</span>;
    return (
        <button
            type="button"
            aria-current={current ? 'step' : undefined}
            onClick={() => onSelect(ply)}
            className={cn('border-0 bg-transparent p-0 text-left font-mono', tone)}
        >
            {san}
        </button>
    );
}

/** The "Moves" card (Game.dc.html): numbered white/black pairs in JetBrains Mono. */
export function MoveList({ moves, currentPly = null, onSelectPly, title = 'Moves', className }: MoveListProps) {
    const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => i * 2);
    return (
        <section
            aria-label={title}
            className={cn(
                'box-border flex min-h-[180px] flex-col overflow-hidden rounded-20 border-1 border-line bg-surface',
                className,
            )}
        >
            <div className="border-b-1 border-line-subtle px-5 py-[14px] font-display text-[17px] font-semibold">
                {title}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {moves.length === 0 && <div className="px-5 py-[14px] text-[14px] text-ink-muted">No moves yet.</div>}
                {rows.map((ply) => (
                    <div key={ply} className="grid grid-cols-[36px_1fr_1fr] gap-2 px-5 py-2 font-mono text-[14px]">
                        <span className="text-ink-faint">{ply / 2 + 1}.</span>
                        <MoveCell san={moves[ply]} ply={ply} current={currentPly === ply} onSelect={onSelectPly} />
                        <MoveCell
                            san={moves[ply + 1]}
                            ply={ply + 1}
                            current={currentPly === ply + 1}
                            onSelect={onSelectPly}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}
