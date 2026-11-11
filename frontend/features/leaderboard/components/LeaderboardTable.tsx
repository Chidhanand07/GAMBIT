import Link from 'next/link';
import type { RatingField } from '@/types/timeControl';
import { DEFAULT_RATING, ratingOf, type LeaderboardPlayer } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

const HEADERS = ['#', 'Player', 'Rating', 'Games', 'Win Rate'];
const WIDE_ONLY = ['Games', 'Win Rate'];
const ROW_HEIGHT = 60;
const PERCENT = 100;

function headerClass(h: string) {
    const align = h === '#' ? 'px-5 w-12 text-left' : h === 'Player' ? 'px-3 text-left' : 'px-4 text-right';
    return `py-2.5 text-[11px] uppercase tracking-wider font-medium ${align} ${WIDE_ONLY.includes(h) ? 'hidden md:table-cell' : ''}`;
}

interface RowProps {
    player: LeaderboardPlayer;
    index: number;
    isLast: boolean;
    ratingField: RatingField;
    bucketLabel: string;
}

function PlayerRow({ player: p, index, isLast, ratingField, bucketLabel }: RowProps) {
    const gp = p.games_played ?? 0;
    const wr = gp > 0 ? Math.round(((p.wins ?? 0) / gp) * PERCENT) : 0;
    return (
        <tr
            className="transition-colors hover:bg-hover"
            style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border)', height: ROW_HEIGHT }}
        >
            <td className="px-5">
                <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {index + 1}
                </span>
            </td>
            <td className="px-3 py-3">
                <div className="flex items-center gap-2.5">
                    <PlayerAvatar player={p} size={34} />
                    <div className="min-w-0">
                        <Link
                            href={`/profile/${p.username}`}
                            className="text-sm font-medium transition-colors truncate block max-w-[120px] hover:text-accent"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {p.display_name || p.username}
                        </Link>
                        <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                            @{p.username}
                        </div>
                    </div>
                </div>
            </td>
            <td className="px-4 text-right">
                <div className="font-semibold tabular-nums text-accent">{ratingOf(p, ratingField)}</div>
                <div className="text-xs capitalize" style={{ color: 'var(--text-tertiary)' }}>
                    {bucketLabel}
                </div>
            </td>
            <td
                className="px-4 text-right text-sm tabular-nums hidden md:table-cell"
                style={{ color: 'var(--text-secondary)' }}
            >
                {gp}
            </td>
            <td className="px-4 text-right hidden md:table-cell">
                <div className="text-sm tabular-nums mb-1" style={{ color: 'var(--text-secondary)' }}>
                    {wr}%
                </div>
                <div
                    className="h-1 rounded-full overflow-hidden w-16 ml-auto"
                    style={{ background: 'var(--bg-elevated)' }}
                >
                    <div className="h-full rounded-full" style={{ width: `${wr}%`, background: 'var(--green)' }} />
                </div>
            </td>
        </tr>
    );
}

interface TableProps {
    players: LeaderboardPlayer[];
    ratingField: RatingField;
    bucketLabel: string;
}

export function LeaderboardTable({ players, ratingField, bucketLabel }: TableProps) {
    return (
        <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
        >
            <table className="w-full">
                <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '0.5px solid var(--border)' }}>
                        {HEADERS.map((h) => (
                            <th key={h} className={headerClass(h)} style={{ color: 'var(--text-tertiary)' }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {players.map((p, i) => (
                        <PlayerRow
                            key={p.username}
                            player={p}
                            index={i}
                            isLast={i === players.length - 1}
                            ratingField={ratingField}
                            bucketLabel={bucketLabel}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function StatsStrip({ players, ratingField }: { players: LeaderboardPlayer[]; ratingField: RatingField }) {
    const total = players.reduce((a, p) => a + (p[ratingField] ?? DEFAULT_RATING), 0);
    // `||` applies before rounding (as in the original expression).
    const avg = Math.round(total / players.length || DEFAULT_RATING);
    const stats = [
        { label: 'Total Players', value: players.length },
        { label: 'Avg Rating', value: avg },
        { label: 'Online Now', value: '—' },
    ];
    return (
        <div className="grid grid-cols-3 gap-3 mt-5">
            {stats.map((s) => (
                <div
                    key={s.label}
                    className="rounded-xl p-4 text-center"
                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}
                >
                    <div className="text-2xl font-semibold tabular-nums text-accent">{s.value}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {s.label}
                    </div>
                </div>
            ))}
        </div>
    );
}
