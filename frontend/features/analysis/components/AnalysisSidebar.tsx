import { Check, ChevronRight, Copy } from 'lucide-react';
import type { Move } from 'chess.js';
import { panelSurface } from '../styles';
import type { AnalysisTab } from '../types';

export function TabBar({ activeTab, onChange }: { activeTab: AnalysisTab; onChange: (tab: AnalysisTab) => void }) {
    return (
        <div
            className="flex shrink-0"
            style={{ background: 'var(--bg-elevated)', borderBottom: '0.5px solid var(--border)' }}
        >
            {(['analysis', 'import'] as const).map((tab) => (
                <button
                    key={tab}
                    onClick={() => onChange(tab)}
                    className="flex-1 h-10 text-sm transition-colors"
                    style={{
                        color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                        fontWeight: activeTab === tab ? 500 : 400,
                    }}
                >
                    {tab === 'analysis' ? 'Analysis' : 'Import'}
                </button>
            ))}
        </div>
    );
}

function EmptyMoveList() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={panelSurface}>
                <ChevronRight size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Make a move or import a game to see the move list
            </p>
        </div>
    );
}

interface MoveListProps {
    moveHistory: Move[];
    currentMoveIndex: number;
    onNavigate: (index: number) => void;
}

/** Scrollable two-column move list; clicking a move jumps to it. */
export function MoveList({ moveHistory, currentMoveIndex, onNavigate }: MoveListProps) {
    return (
        <div className="flex-1 overflow-y-auto min-h-0">
            {moveHistory.length > 0 ? (
                <div className="p-2">
                    {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[28px_1fr_1fr] rounded transition-colors hover:bg-hover">
                            <span
                                className="text-[11px] py-1.5 pl-2 tabular-nums self-center"
                                style={{ color: 'var(--text-tertiary)' }}
                            >
                                {i + 1}.
                            </span>
                            {[i * 2, i * 2 + 1].map((mi) =>
                                moveHistory[mi] ? (
                                    <button
                                        key={mi}
                                        onClick={() => onNavigate(mi)}
                                        className="text-left font-mono text-xs px-2 py-1.5 rounded transition-colors"
                                        style={{
                                            color: currentMoveIndex === mi ? 'var(--accent)' : 'var(--text-secondary)',
                                            background: currentMoveIndex === mi ? 'var(--accent-dim)' : 'transparent',
                                            fontWeight: currentMoveIndex === mi ? 600 : 400,
                                        }}
                                    >
                                        {moveHistory[mi].san}
                                    </button>
                                ) : (
                                    <span key={mi} />
                                ),
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyMoveList />
            )}
        </div>
    );
}

/** Current FEN with a copy button. */
export function FenFooter({ fen, copied, onCopy }: { fen: string; copied: boolean; onCopy: () => void }) {
    return (
        <div
            className="shrink-0 p-3"
            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--bg-elevated)' }}
        >
            <div className="flex items-center justify-between mb-1.5">
                <span
                    className="text-[10px] uppercase tracking-wider font-medium"
                    style={{ color: 'var(--text-tertiary)' }}
                >
                    FEN
                </span>
                <button
                    onClick={onCopy}
                    className="flex items-center gap-1 text-[10px] transition-colors"
                    style={{ color: copied ? 'var(--accent)' : 'var(--text-tertiary)' }}
                >
                    {copied ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <div
                className="font-mono text-[9px] break-all leading-relaxed select-all"
                style={{ color: 'var(--text-tertiary)' }}
            >
                {fen}
            </div>
        </div>
    );
}
