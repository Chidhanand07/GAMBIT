'use client';

// Controls under the board: sound, flip, step back, resign (with confirm), spectator badge.
import { Flag, RotateCcw, Undo2, Volume2, VolumeX } from 'lucide-react';
import { CheckIcon, CrossIcon } from './icons';

const ICON = { size: 17, strokeWidth: 1.5 };
const SMALL_GLYPH = 13;
const BUTTON =
    'w-10 h-10 flex items-center justify-center rounded-lg border border-border hover:bg-surface text-text-secondary hover:text-text-primary transition-colors';

export interface ResignControlProps {
    resignConfirm: boolean;
    onResignRequest: () => void;
    onResignConfirm: () => void;
    onResignCancel: () => void;
}

function ResignControl({ resignConfirm, onResignRequest, onResignConfirm, onResignCancel }: ResignControlProps) {
    if (!resignConfirm) {
        return (
            <button
                onClick={onResignRequest}
                title="Resign"
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-border hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-colors"
            >
                <Flag {...ICON} />
            </button>
        );
    }
    return (
        <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/40 rounded-lg px-2 py-1">
            <span className="text-red-400 text-xs font-medium">Resign?</span>
            <button
                onClick={onResignConfirm}
                title="Confirm resign"
                className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20 transition-colors"
            >
                <CheckIcon size={SMALL_GLYPH} />
            </button>
            <button
                onClick={onResignCancel}
                title="Cancel"
                className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:bg-surface transition-colors"
            >
                <CrossIcon size={SMALL_GLYPH} />
            </button>
        </div>
    );
}

export interface ActionBarProps extends ResignControlProps {
    soundOn: boolean;
    onToggleSound: () => void;
    onFlip: () => void;
    hasHistory: boolean;
    onStepBack: () => void;
    canResign: boolean;
    isSpectator: boolean;
}

export default function ActionBar({
    soundOn,
    onToggleSound,
    onFlip,
    hasHistory,
    onStepBack,
    canResign,
    isSpectator,
    ...resign
}: ActionBarProps) {
    return (
        <div className="flex justify-center gap-2 mt-3">
            <button onClick={onToggleSound} title="Toggle sound" className={BUTTON}>
                {soundOn ? <Volume2 {...ICON} /> : <VolumeX {...ICON} />}
            </button>
            <button onClick={onFlip} title="Flip board" className={BUTTON}>
                <RotateCcw {...ICON} />
            </button>
            {hasHistory && (
                <button onClick={onStepBack} title="Step back one move" className={BUTTON}>
                    <Undo2 {...ICON} />
                </button>
            )}
            {canResign && <ResignControl {...resign} />}
            {isSpectator && (
                <span className="flex items-center px-3 py-1.5 rounded-lg bg-surface border border-border text-text-tertiary text-xs">
                    Spectating
                </span>
            )}
        </div>
    );
}
