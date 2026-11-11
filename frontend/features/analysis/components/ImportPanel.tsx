import { focusBorder, panelSurface, textHover } from '../styles';

const QUICK_POSITIONS = [
    { label: 'Starting Position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    { label: "King's Gambit", fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2' },
    { label: 'Sicilian Defense', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2' },
    { label: 'Ruy Lopez', fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
];

const labelClass = 'text-[10px] uppercase tracking-wider mb-2 block font-medium';
const tertiary = { color: 'var(--text-tertiary)' };
const textareaStyle = { ...panelSurface, color: 'var(--text-primary)' };

interface ImportPanelProps {
    customFen: string;
    onCustomFen: (v: string) => void;
    customPgn: string;
    onCustomPgn: (v: string) => void;
    onQuickPosition: (fen: string) => void;
    onLoadFen: () => void;
    onLoadPgn: () => void;
}

/** Quick positions, "Load from FEN" and "Import Game (PGN)". */
export function ImportPanel(props: ImportPanelProps) {
    const { customFen, onCustomFen, customPgn, onCustomPgn, onQuickPosition, onLoadFen, onLoadPgn } = props;
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Quick positions */}
            <div>
                <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={tertiary}>
                    Quick Positions
                </div>
                <div className="flex flex-col gap-1.5">
                    {QUICK_POSITIONS.map((pos) => (
                        <button
                            key={pos.label}
                            onClick={() => onQuickPosition(pos.fen)}
                            className="text-left px-3 py-2 rounded-lg text-sm transition-colors"
                            style={{ ...panelSurface, color: 'var(--text-secondary)' }}
                            {...textHover}
                        >
                            {pos.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* FEN input */}
            <div>
                <label className={labelClass} style={tertiary}>
                    Load from FEN
                </label>
                <textarea
                    value={customFen}
                    onChange={(e) => onCustomFen(e.target.value)}
                    rows={3}
                    placeholder="Paste FEN string…"
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs resize-none focus:outline-none transition-colors"
                    style={textareaStyle}
                    {...focusBorder}
                />
                <button
                    onClick={onLoadFen}
                    className="w-full mt-2 py-2 rounded-lg text-sm font-medium transition-colors btn-press"
                    style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                >
                    Load Position
                </button>
            </div>

            {/* PGN input */}
            <div>
                <label className={labelClass} style={tertiary}>
                    Import Game (PGN)
                </label>
                <textarea
                    value={customPgn}
                    onChange={(e) => onCustomPgn(e.target.value)}
                    rows={7}
                    placeholder="Paste PGN…"
                    className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none transition-colors font-mono"
                    style={textareaStyle}
                    {...focusBorder}
                />
                <button
                    onClick={onLoadPgn}
                    className="w-full mt-2 py-2 rounded-lg text-sm font-medium btn-press transition-colors"
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '0.5px solid var(--border-strong)',
                        color: 'var(--text-primary)',
                    }}
                >
                    Import Game
                </button>
            </div>
        </div>
    );
}
