import type { MoveClassification } from '@/types/game';

const GRAPH_WIDTH = 480;
const GRAPH_HEIGHT = 64;
const EVAL_CLAMP_CP = 800;

interface EvalGraphProps {
    moves: MoveClassification[];
    ply: number;
    onSeek: (p: number) => void;
}

export function EvalGraph({ moves, ply, onSeek }: EvalGraphProps) {
    if (!moves.length) return null;
    const W = GRAPH_WIDTH,
        H = GRAPH_HEIGHT,
        mid = H / 2;
    const clamp = (cp: number) => Math.max(-EVAL_CLAMP_CP, Math.min(EVAL_CLAMP_CP, cp));
    const pts = moves.map((m, i) => {
        const x = (i / Math.max(1, moves.length - 1)) * W;
        const y = mid - (clamp(m.eval_white) / EVAL_CLAMP_CP) * mid;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const cursorX = ((Math.max(1, ply) - 1) / Math.max(1, moves.length - 1)) * W;
    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full mt-3 rounded bg-elevated cursor-pointer"
            onClick={(e) => {
                const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                const frac = (e.clientX - rect.left) / rect.width;
                onSeek(Math.round(frac * moves.length));
            }}
        >
            <rect x="0" y="0" width={W} height={mid} fill="#ffffff08" />
            <line x1="0" y1={mid} x2={W} y2={mid} stroke="#ffffff22" strokeWidth="1" />
            <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
            {ply > 0 && (
                <line x1={cursorX} y1="0" x2={cursorX} y2={H} stroke="var(--accent)" strokeWidth="1" opacity="0.6" />
            )}
        </svg>
    );
}
