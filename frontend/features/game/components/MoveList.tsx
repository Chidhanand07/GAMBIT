'use client';

// Numbered SAN move pairs; clicking a move views that position.
import type { RefObject } from 'react';

export interface MoveListProps {
    moveList: string[];
    viewIndex: number | null;
    onSelect: (index: number) => void;
    scrollRef: RefObject<HTMLDivElement>;
}

const moveClass = (selected: boolean) =>
    `text-left font-mono transition-colors px-1 rounded ${selected ? 'bg-accent/20 text-accent' : 'text-text-primary hover:text-accent'}`;

export default function MoveList({ moveList, viewIndex, onSelect, scrollRef }: MoveListProps) {
    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
            <div className="space-y-0.5">
                {Array.from({ length: Math.ceil(moveList.length / 2) }).map((_, i) => {
                    const wi = i * 2;
                    const bi = i * 2 + 1;
                    return (
                        <div
                            key={i}
                            className="grid grid-cols-[28px_1fr_1fr] text-sm py-1 rounded hover:bg-elevated px-1"
                        >
                            <span className="text-text-tertiary">{i + 1}.</span>
                            <button onClick={() => onSelect(wi)} className={moveClass(viewIndex === wi)}>
                                {moveList[wi] ?? ''}
                            </button>
                            {moveList[bi] !== undefined && (
                                <button onClick={() => onSelect(bi)} className={moveClass(viewIndex === bi)}>
                                    {moveList[bi]}
                                </button>
                            )}
                        </div>
                    );
                })}
                {moveList.length === 0 && <p className="text-text-tertiary text-sm text-center py-6">No moves yet</p>}
            </div>
        </div>
    );
}
