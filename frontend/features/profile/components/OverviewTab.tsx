import type { Profile } from '@/types/profile';
import type { SpeedBucket } from '@/types/timeControl';
import type { ProfileRecord } from '../format';
import { RATING_ICONS } from './ratingIcons';
import { RecentGamesList } from './RecentGamesList';

type RatingField = 'rating_bullet' | 'rating_blitz' | 'rating_rapid' | 'rating_classical';
type PeakField = 'peak_bullet' | 'peak_blitz' | 'peak_rapid' | 'peak_classical';
type RatingProfile = Pick<Profile, RatingField | PeakField>;

const RATING_CARDS: { id: SpeedBucket; label: string; field: RatingField; peakField: PeakField }[] = [
    { id: 'bullet', label: 'Bullet', field: 'rating_bullet', peakField: 'peak_bullet' },
    { id: 'blitz', label: 'Blitz', field: 'rating_blitz', peakField: 'peak_blitz' },
    { id: 'rapid', label: 'Rapid', field: 'rating_rapid', peakField: 'peak_rapid' },
    { id: 'classical', label: 'Classical', field: 'rating_classical', peakField: 'peak_classical' },
];

const isRating = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Highest rating reached in a category: the stored peak, never below the current rating
 * (a peak column can lag one game behind). Null when the profile has no peak (F12).
 */
export function peakRating(rating: number | null | undefined, peak: number | null | undefined): number | null {
    if (!isRating(peak)) return null;
    return Math.round(isRating(rating) ? Math.max(peak, rating) : peak);
}

function RatingCards({ profile }: { profile: RatingProfile }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {RATING_CARDS.map((tc) => {
                const rating = profile[tc.field];
                const shown = rating ? Math.round(rating) : '—';
                const peak = peakRating(rating, profile[tc.peakField]);
                return (
                    <div
                        key={tc.id}
                        className="rounded-xl p-4"
                        style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
                    >
                        <div
                            className="flex items-center gap-1.5 text-xs uppercase tracking-wider mb-3"
                            style={{ color: 'var(--text-tertiary)' }}
                        >
                            <span className="text-accent">{RATING_ICONS[tc.id]}</span>
                            {tc.label}
                        </div>
                        <div
                            className="text-[30px] font-semibold leading-none tabular-nums"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {shown}
                        </div>
                        {peak !== null && (
                            <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                                Peak {peak}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function RecordStat({ value, label, valueClass }: { value: string | number; label: string; valueClass: string }) {
    return (
        <div className="text-center">
            <div className={`text-xl font-medium ${valueClass} tabular-nums`}>{value}</div>
            <div className="text-xs text-text-tertiary mt-1">{label}</div>
        </div>
    );
}

function RecordCard({ record }: { record: ProfileRecord }) {
    const { gamesPlayed, wins, losses, draws, winRate } = record;
    return (
        <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs uppercase tracking-wider text-text-tertiary font-medium">Record</h3>
                <span className="text-text-tertiary text-sm">{gamesPlayed} games</span>
            </div>
            <div className="flex items-end gap-6 mb-4">
                <RecordStat value={wins} label="Wins" valueClass="text-indicator-green" />
                <RecordStat value={losses} label="Losses" valueClass="text-red-400" />
                <RecordStat value={draws} label="Draws" valueClass="text-text-secondary" />
                {gamesPlayed > 0 && (
                    <div className="text-center ml-auto">
                        <div className="text-xl font-medium text-text-primary tabular-nums">{winRate}%</div>
                        <div className="text-xs text-text-tertiary mt-1">Win rate</div>
                    </div>
                )}
            </div>
            {gamesPlayed > 0 && (
                <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
                    {wins > 0 && <div style={{ flex: wins }} className="bg-indicator-green" />}
                    {losses > 0 && <div style={{ flex: losses }} className="bg-red-500" />}
                    {draws > 0 && <div style={{ flex: draws }} className="bg-[var(--text-tertiary)]" />}
                </div>
            )}
        </div>
    );
}

interface OverviewTabProps {
    username: string;
    profile: RatingProfile & Pick<Profile, 'id'>;
    record: ProfileRecord;
    onViewAllGames: () => void;
}

/** Rating cards, lifetime record and the recent-games preview. */
export function OverviewTab({ username, profile, record, onViewAllGames }: OverviewTabProps) {
    return (
        <>
            <RatingCards profile={profile} />
            <RecordCard record={record} />
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-medium text-text-primary">Recent Games</h3>
                    <button onClick={onViewAllGames} className="text-accent text-xs hover:underline">
                        View all
                    </button>
                </div>
                <RecentGamesList username={username} profileId={profile.id} />
            </div>
        </>
    );
}
