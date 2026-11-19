import type { SettingsProfile } from '../types';
import { FIELD, HINT, READONLY_INPUT } from './styles';

const DEFAULT_RATING = 1200;

const RATINGS = [
    { label: 'Bullet', field: 'rating_bullet' },
    { label: 'Blitz', field: 'rating_blitz' },
    { label: 'Rapid', field: 'rating_rapid' },
    { label: 'Classical', field: 'rating_classical' },
] as const;

/** Read-only sign-in details and the four ratings (rounded, 1200 when missing). */
export function AccountSection({ profile, email }: { profile: SettingsProfile; email: string | null }) {
    return (
        <div className="pb-[10px]">
            <label className={`${FIELD} pt-2`}>
                <span className="font-semibold">Username</span>
                <input type="text" value={profile.username} readOnly className={READONLY_INPUT} />
            </label>
            {email && (
                <label className={FIELD}>
                    <span className="font-semibold">Email</span>
                    <input type="email" value={email} readOnly className={READONLY_INPUT} />
                    <span className={HINT}>Used for sign-in and account recovery.</span>
                </label>
            )}
            <div className="flex flex-col gap-[10px] px-7 pb-[18px]">
                <span className="font-semibold">Ratings</span>
                {RATINGS.map((r) => (
                    <div
                        key={r.label}
                        className="flex min-h-[48px] items-center justify-between rounded-14 border-1 border-line bg-bg-base px-[18px]"
                    >
                        <span className="text-ink-muted">{r.label}</span>
                        <span className="font-mono font-bold text-accent">
                            {Math.round(profile[r.field] ?? DEFAULT_RATING)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
