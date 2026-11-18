'use client';

import { Piece } from '@/components/chess/Piece';

const CHOICES = [
    { type: 'q', name: 'Queen' },
    { type: 'r', name: 'Rook' },
    { type: 'b', name: 'Bishop' },
    { type: 'n', name: 'Knight' },
] as const;

interface PromotionPickerProps {
    color: 'w' | 'b';
    onSelect: (piece: string) => void;
}

/** Overlay on the board when a pawn promotes. No mockup: the dialog surface over the scrim. */
export function PromotionPicker({ color, onSelect }: PromotionPickerProps) {
    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim">
            <div className="flex flex-col gap-3 rounded-20 border-1 border-line bg-surface-header p-4 shadow-popover">
                <span className="text-center text-[13px] font-semibold text-ink-muted">Choose promotion</span>
                <div className="grid grid-cols-4 gap-2">
                    {CHOICES.map((c) => (
                        <button
                            key={c.type}
                            type="button"
                            onClick={() => onSelect(c.type)}
                            className="box-border flex h-[72px] w-[64px] flex-col items-center justify-center gap-1 rounded-14 border-1 border-line bg-bg-base text-[11px] font-semibold text-ink-muted"
                        >
                            <Piece color={color} type={c.type} className="h-9 w-9 drop-shadow-piece" />
                            {c.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
