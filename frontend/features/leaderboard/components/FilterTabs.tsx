import type { ReactNode } from 'react';
import { Zap, Flame, Timer, BookOpen } from 'lucide-react';

export type LeaderboardFilter = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical';

const FILTERS: { id: LeaderboardFilter; label: string; icon?: ReactNode }[] = [
    { id: 'all', label: 'All' },
    { id: 'bullet', label: 'Bullet', icon: <Zap size={12} strokeWidth={1.5} /> },
    { id: 'blitz', label: 'Blitz', icon: <Flame size={12} strokeWidth={1.5} /> },
    { id: 'rapid', label: 'Rapid', icon: <Timer size={12} strokeWidth={1.5} /> },
    { id: 'classical', label: 'Classical', icon: <BookOpen size={12} strokeWidth={1.5} /> },
];

function tabStyle(active: boolean) {
    return {
        background: active ? 'var(--bg-active)' : 'transparent',
        border: active ? '0.5px solid var(--border-strong)' : '0.5px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? 500 : 400,
    };
}

/** Pill-style speed filter. */
export function FilterTabs({
    value,
    onChange,
}: {
    value: LeaderboardFilter;
    onChange: (f: LeaderboardFilter) => void;
}) {
    return (
        <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: 'var(--bg-elevated)' }}>
            {FILTERS.map((tc) => (
                <button
                    key={tc.id}
                    onClick={() => onChange(tc.id)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-colors"
                    style={tabStyle(value === tc.id)}
                >
                    {tc.icon}
                    {tc.label}
                </button>
            ))}
        </div>
    );
}
