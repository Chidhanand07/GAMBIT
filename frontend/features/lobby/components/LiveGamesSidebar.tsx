import { DEFAULT_RATING } from '../constants';
import type { LobbyProfile } from '../types';

interface LiveGamesSidebarProps {
    profile: LobbyProfile | null;
    onlineCount: number;
}

/** Placeholder "Live Games" card (always empty) and the two quick stats. */
export function LiveGamesSidebar({ profile, onlineCount }: LiveGamesSidebarProps) {
    const stats = [
        { label: 'Online', value: String(onlineCount) },
        { label: 'Your rating', value: String(Math.round(profile?.rating_rapid ?? DEFAULT_RATING)) },
    ];
    return (
        <div className="lg:w-72 shrink-0">
            <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
            >
                <div
                    className="flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <span
                        className="text-xs uppercase tracking-[0.1em] font-medium"
                        style={{ color: 'var(--text-tertiary)' }}
                    >
                        Live Games
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        Live
                    </span>
                </div>
                <div className="p-3">
                    <div className="py-10 flex flex-col items-center gap-2 text-center">
                        <span
                            className="opacity-20 font-serif select-none"
                            style={{ color: 'var(--text-tertiary)', fontSize: '50px', lineHeight: 1 }}
                        >
                            ♘
                        </span>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            No live games
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            Start one and it&apos;ll appear here
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {stats.map((s) => (
                    <div
                        key={s.label}
                        className="rounded-xl p-3 text-center"
                        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}
                    >
                        <div className="font-semibold text-lg tabular-nums text-accent">{s.value}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {s.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
