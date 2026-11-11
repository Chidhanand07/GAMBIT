import { DEFAULT_RATING } from '../constants';
import type { LobbyProfile } from '../types';

interface WelcomeBarProps {
    profile: LobbyProfile | null;
    onlineCount: number;
}

export function WelcomeBar({ profile, onlineCount }: WelcomeBarProps) {
    return (
        <div
            className="rounded-xl px-5 py-4 mb-5 flex items-center justify-between"
            style={{ background: 'var(--accent-glow)', border: '0.5px solid var(--border-accent)' }}
        >
            <div>
                <div className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                    {profile ? `Welcome back, ${profile.display_name || profile.username}` : 'Welcome to Gambit'}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {onlineCount} player{onlineCount !== 1 ? 's' : ''} online
                </div>
            </div>
            {profile && (
                <div className="text-right hidden sm:block">
                    <div className="font-semibold tabular-nums text-lg text-accent">
                        {Math.round(profile.rating_blitz ?? DEFAULT_RATING)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Blitz rating
                    </div>
                </div>
            )}
        </div>
    );
}
