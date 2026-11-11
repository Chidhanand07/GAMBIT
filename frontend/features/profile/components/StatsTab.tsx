import type { ReactNode } from 'react';
import type { CategoryRecord, ProfileStats } from '@/types/profilePage';
import type { SpeedBucket } from '@/types/timeControl';
import { RATING_ICONS } from './ratingIcons';

const DEFAULT_RATING = 1200;
const EMPTY_RECORD: CategoryRecord = { played: 0, wins: 0, losses: 0, draws: 0 };

const CATEGORIES: { key: SpeedBucket; label: string }[] = [
    { key: 'bullet', label: 'Bullet' },
    { key: 'blitz', label: 'Blitz' },
    { key: 'rapid', label: 'Rapid' },
    { key: 'classical', label: 'Classical' },
];

function TotalCard({ value, label, valueClass }: { value: number; label: string; valueClass: string }) {
    return (
        <div className="bg-surface border border-border rounded-xl p-5 text-center">
            <div className={`text-4xl font-bold ${valueClass} tabular-nums`}>{value}</div>
            <div className="text-text-tertiary text-sm mt-1">{label}</div>
        </div>
    );
}

function Totals({ stats }: { stats: ProfileStats }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TotalCard value={stats.total ?? 0} label="Total Games" valueClass="text-text-primary" />
            <TotalCard value={stats.wins ?? 0} label="Wins" valueClass="text-indicator-green" />
            <TotalCard value={stats.losses ?? 0} label="Losses" valueClass="text-red-400" />
            <TotalCard value={stats.draws ?? 0} label="Draws" valueClass="text-text-secondary" />
        </div>
    );
}

function CountLine({
    label,
    value,
    labelClass,
    valueClass,
}: Record<'label' | 'labelClass' | 'valueClass', string> & { value: number }) {
    return (
        <div className="flex justify-between text-xs">
            <span className={labelClass}>{label}</span>
            <span className={valueClass}>{value}</span>
        </div>
    );
}

interface CategoryCardProps {
    label: string;
    icon: ReactNode;
    rating: number | null | undefined;
    record: CategoryRecord;
}

function CategoryCard({ label, icon, rating, record: s }: CategoryCardProps) {
    return (
        <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-text-secondary text-xs uppercase tracking-wider mb-3">
                <span className="text-accent">{icon}</span>
                {label}
            </div>
            <div className="text-3xl font-bold text-text-primary tabular-nums mb-3">
                {Math.round(rating ?? DEFAULT_RATING)}
            </div>
            <div className="space-y-1">
                <CountLine
                    label="Played"
                    value={s.played}
                    labelClass="text-text-tertiary"
                    valueClass="text-text-primary tabular-nums font-medium"
                />
                <CountLine
                    label="Wins"
                    value={s.wins}
                    labelClass="text-indicator-green"
                    valueClass="text-indicator-green tabular-nums font-medium"
                />
                <CountLine
                    label="Losses"
                    value={s.losses}
                    labelClass="text-red-400"
                    valueClass="text-red-400 tabular-nums font-medium"
                />
                <CountLine
                    label="Draws"
                    value={s.draws}
                    labelClass="text-text-tertiary"
                    valueClass="text-text-secondary tabular-nums"
                />
            </div>
            {s.played > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px mt-3">
                    {s.wins > 0 && <div style={{ flex: s.wins }} className="bg-indicator-green" />}
                    {s.losses > 0 && <div style={{ flex: s.losses }} className="bg-red-500" />}
                    {s.draws > 0 && <div style={{ flex: s.draws }} className="bg-border" />}
                </div>
            )}
        </div>
    );
}

/** Stats tab: a spinner until the stats arrive, then totals and per-speed breakdown cards. */
export function StatsTab({ stats }: { stats: ProfileStats | null }) {
    return (
        <div className="space-y-6">
            {!stats ? (
                <div className="py-16 flex justify-center">
                    <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    <Totals stats={stats} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {CATEGORIES.map((cat) => (
                            <CategoryCard
                                key={cat.key}
                                label={cat.label}
                                icon={RATING_ICONS[cat.key]}
                                rating={stats.ratings?.[cat.key]}
                                record={stats.byCategory?.[cat.key] ?? EMPTY_RECORD}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
