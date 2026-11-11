'use client';

// Sidebar copy of the board controls (different styling and hover handlers from ActionBar).
import type { MouseEvent } from 'react';
import { Flag, RotateCcw, Undo2, Volume2, VolumeX } from 'lucide-react';
import type { ActionBarProps } from './ActionBar';
import { CheckIcon, CrossIcon } from './icons';

const ICON = { size: 16, strokeWidth: 1.5 };
const SMALL_GLYPH = 12;
const BUTTON = 'w-9 h-9 flex items-center justify-center rounded-xl transition-colors';
const BUTTON_STYLE = {
    background: 'var(--bg-elevated)',
    border: '0.5px solid var(--border-strong)',
    color: 'var(--text-secondary)',
};

const hover = {
    onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.color = 'var(--text-primary)'),
    onMouseLeave: (e: MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.color = 'var(--text-secondary)'),
};

const resignHover = {
    onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.color = '#f87171';
        e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
    },
    onMouseLeave: (e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.color = 'var(--text-secondary)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
    },
};

type SidebarActionsProps = Omit<ActionBarProps, 'isSpectator'>;

function SidebarResign({ resignConfirm, onResignRequest, onResignConfirm, onResignCancel }: SidebarActionsProps) {
    if (!resignConfirm) {
        return (
            <button onClick={onResignRequest} title="Resign" className={BUTTON} style={BUTTON_STYLE} {...resignHover}>
                <Flag {...ICON} />
            </button>
        );
    }
    return (
        <div
            className="flex items-center gap-1 rounded-xl px-2 py-1"
            style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.4)' }}
        >
            <span className="text-red-400 text-xs font-medium">Resign?</span>
            <button
                onClick={onResignConfirm}
                className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20 transition-colors"
            >
                <CheckIcon size={SMALL_GLYPH} />
            </button>
            <button
                onClick={onResignCancel}
                className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
            >
                <CrossIcon size={SMALL_GLYPH} />
            </button>
        </div>
    );
}

export default function SidebarActions(props: SidebarActionsProps) {
    return (
        <div className="border-t border-border px-3 py-2 flex items-center justify-center gap-2 shrink-0">
            <button
                onClick={props.onToggleSound}
                title="Toggle sound"
                className={BUTTON}
                style={BUTTON_STYLE}
                {...hover}
            >
                {props.soundOn ? <Volume2 {...ICON} /> : <VolumeX {...ICON} />}
            </button>
            <button onClick={props.onFlip} title="Flip board" className={BUTTON} style={BUTTON_STYLE} {...hover}>
                <RotateCcw {...ICON} />
            </button>
            <button
                onClick={props.onStepBack}
                disabled={!props.hasHistory}
                title="Step back"
                className={`${BUTTON} disabled:opacity-30`}
                style={BUTTON_STYLE}
                {...hover}
            >
                <Undo2 {...ICON} />
            </button>
            {props.canResign && <SidebarResign {...props} />}
        </div>
    );
}
