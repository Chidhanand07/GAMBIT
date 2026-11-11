import type { MouseEvent } from 'react';
import { Users } from 'lucide-react';

interface PlayActionsProps {
    onPlayOnline: () => void;
    onComputer: () => void;
    onFriend: () => void;
}

const SECONDARY_BUTTON_STYLE = {
    background: 'var(--bg-elevated)',
    border: '0.5px solid var(--border-strong)',
    color: 'var(--text-primary)',
};

function secondaryHoverIn(e: MouseEvent<HTMLButtonElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)';
    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
}

function secondaryHoverOut(e: MouseEvent<HTMLButtonElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
    (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
}

/** Play Online (spans both columns), Computer and Friend. */
export function PlayActions({ onPlayOnline, onComputer, onFriend }: PlayActionsProps) {
    return (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto' }}>
            <button
                onClick={onPlayOnline}
                className="h-11 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm btn-press transition-all"
                style={{ background: 'var(--accent)', color: '#0F0D0B', gridColumn: 'span 2' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                </svg>
                Play Online
            </button>
            <button
                onClick={onComputer}
                className="h-11 flex items-center justify-center gap-2 rounded-xl text-sm btn-press transition-colors"
                style={SECONDARY_BUTTON_STYLE}
                onMouseEnter={secondaryHoverIn}
                onMouseLeave={secondaryHoverOut}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                </svg>
                Computer
            </button>
            <button
                onClick={onFriend}
                className="h-11 flex items-center justify-center gap-2 rounded-xl text-sm btn-press transition-colors"
                style={SECONDARY_BUTTON_STYLE}
                onMouseEnter={secondaryHoverIn}
                onMouseLeave={secondaryHoverOut}
            >
                <Users size={15} strokeWidth={1.5} />
                Friend
            </button>
        </div>
    );
}
