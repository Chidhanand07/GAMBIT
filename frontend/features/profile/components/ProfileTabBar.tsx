import type { ProfileTab } from '../types';

interface ProfileTabBarProps {
    activeTab: ProfileTab;
    gamesPlayed: number;
    onSelect: (tab: ProfileTab) => void;
}

function tabsFor(gamesPlayed: number): { id: ProfileTab; label: string }[] {
    return [
        { id: 'overview', label: 'Overview' },
        { id: 'games', label: `Games${gamesPlayed > 0 ? ` (${gamesPlayed})` : ''}` },
        { id: 'stats', label: 'Stats' },
        { id: 'friends', label: 'Friends' },
    ];
}

/** Sticky pill-style tab switcher; the Games label carries the lifetime game count. */
export function ProfileTabBar({ activeTab, gamesPlayed, onSelect }: ProfileTabBarProps) {
    return (
        <div className="flex px-4 md:px-6 py-3 bg-page sticky top-[56px] z-10 border-b border-border">
            <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
                {tabsFor(gamesPlayed).map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onSelect(tab.id)}
                            className="px-4 py-1.5 rounded-lg text-sm transition-colors"
                            style={{
                                background: isActive ? 'var(--bg-active)' : 'transparent',
                                border: isActive ? '0.5px solid var(--border-strong)' : '0.5px solid transparent',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: isActive ? 500 : 400,
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
