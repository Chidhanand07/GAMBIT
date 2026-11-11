import type { SettingsProfile } from '../types';

const DEFAULT_RATING = 1200;

export function AccountSection({ profile }: { profile: SettingsProfile }) {
    const ratings = [
        { label: 'Bullet', val: profile.rating_bullet },
        { label: 'Blitz', val: profile.rating_blitz },
        { label: 'Rapid', val: profile.rating_rapid },
        { label: 'Classical', val: profile.rating_classical },
    ];
    return (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-elevated">
                <h2 className="text-lg font-medium text-text-primary">Account</h2>
            </div>
            <div className="p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Username</label>
                    <div className="flex gap-2 items-center">
                        <input
                            type="text"
                            value={profile.username}
                            disabled
                            className="flex-1 h-11 bg-elevated border border-border rounded-lg px-4 text-text-tertiary cursor-not-allowed"
                        />
                        <span className="text-text-tertiary text-xs px-3">Read-only</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Ratings</label>
                    <div className="grid grid-cols-2 gap-3">
                        {ratings.map((r) => (
                            <div
                                key={r.label}
                                className="flex justify-between items-center bg-elevated border border-border rounded-lg px-4 py-2.5"
                            >
                                <span className="text-text-secondary text-sm">{r.label}</span>
                                <span className="text-accent font-medium tabular-nums">
                                    {Math.round(r.val ?? DEFAULT_RATING)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
