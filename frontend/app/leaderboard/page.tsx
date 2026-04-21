"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Zap, Flame, Timer, BookOpen, Crown } from 'lucide-react';

const TIME_CONTROLS = [
    { id: 'all', label: 'All' },
    { id: 'bullet', label: 'Bullet', icon: <Zap size={12} strokeWidth={1.5} /> },
    { id: 'blitz', label: 'Blitz', icon: <Flame size={12} strokeWidth={1.5} /> },
    { id: 'rapid', label: 'Rapid', icon: <Timer size={12} strokeWidth={1.5} /> },
    { id: 'classical', label: 'Classical', icon: <BookOpen size={12} strokeWidth={1.5} /> },
];

const RATING_FIELD: Record<string, string> = {
    all: 'rating_rapid', bullet: 'rating_bullet',
    blitz: 'rating_blitz', rapid: 'rating_rapid', classical: 'rating_classical',
};

const MEDAL = ['#FFD700','#C0C0C0','#CD7F32'];

function Avatar({ player, size = 36 }: { player: any; size?: number }) {
    const initial = (player.display_name || player.username || '?')[0].toUpperCase();
    return (
        <div className="rounded-full flex items-center justify-center shrink-0 overflow-hidden font-semibold"
            style={{ width: size, height: size, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', fontSize: size * 0.38, color: 'var(--accent)' }}>
            {player.avatar_url
                ? <img src={player.avatar_url} alt="" style={{ width: size, height: size, objectFit: 'cover' }} />
                : initial}
        </div>
    );
}

export default function LeaderboardPage() {
    const [filter, setFilter] = useState('all');
    const [players, setPlayers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/leaderboard?field=${RATING_FIELD[filter]}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { setPlayers(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [filter]);

    const ratingField = RATING_FIELD[filter];
    const top3 = players.slice(0, 3);
    const rest = players.slice(3);

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 page-enter">

            {/* Page header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Trophy size={22} className="text-accent" strokeWidth={1.5} />
                    <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>Leaderboard</h1>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Updated live
                </div>
            </div>

            {/* Filter tabs — pill style */}
            <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: 'var(--bg-elevated)' }}>
                {TIME_CONTROLS.map(tc => (
                    <button key={tc.id} onClick={() => setFilter(tc.id)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-colors"
                        style={{
                            background: filter === tc.id ? 'var(--bg-active)' : 'transparent',
                            border: filter === tc.id ? '0.5px solid var(--border-strong)' : '0.5px solid transparent',
                            color: filter === tc.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: filter === tc.id ? 500 : 400,
                        }}>
                        {tc.icon}{tc.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="skeleton h-[60px] rounded-xl" />
                    ))}
                </div>
            ) : players.length === 0 ? (
                <div className="text-center py-20" style={{ color: 'var(--text-tertiary)' }}>
                    <Trophy size={40} className="mx-auto mb-4 opacity-20" strokeWidth={1} />
                    <div className="font-medium mb-1">No ranked players yet</div>
                    <div className="text-sm">Play some games to appear here</div>
                </div>
            ) : (
                <>
                    {/* Podium — only if 3+ players */}
                    {top3.length >= 3 && (
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {[top3[1], top3[0], top3[2]].map((p, podiumIdx) => {
                                const rank = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2;
                                const isFirst = rank === 0;
                                return (
                                    <Link href={`/profile/${p.username}`} key={p.username}
                                        className="rounded-xl p-4 text-center flex flex-col items-center gap-2 transition-all hover:brightness-110"
                                        style={{
                                            background: isFirst ? 'linear-gradient(180deg,var(--accent-dim),var(--bg-surface))' : 'var(--bg-surface)',
                                            border: isFirst ? '1.5px solid var(--border-accent)' : '0.5px solid var(--border-strong)',
                                            paddingTop: isFirst ? '1.5rem' : '1rem',
                                        }}>
                                        {isFirst && <Crown size={18} className="text-accent" strokeWidth={1.5} />}
                                        <Avatar player={p} size={isFirst ? 52 : 44} />
                                        <div className="min-w-0 w-full">
                                            <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{p.display_name || p.username}</div>
                                            <div className="font-bold tabular-nums text-accent" style={{ fontSize: isFirst ? 22 : 18 }}>
                                                {Math.round(p[ratingField] ?? 1200)}
                                            </div>
                                            <div className="text-xs mt-0.5 font-semibold" style={{ color: MEDAL[rank] }}>
                                                #{rank + 1}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {/* Table */}
                    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}>
                        <table className="w-full">
                            <thead>
                                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '0.5px solid var(--border)' }}>
                                    {['#','Player','Rating','Games','Win Rate'].map(h => (
                                        <th key={h} className={`py-2.5 text-[11px] uppercase tracking-wider font-medium ${h==='#'?'px-5 w-12 text-left':h==='Player'?'px-3 text-left':'px-4 text-right'} ${['Games','Win Rate'].includes(h)?'hidden md:table-cell':''}`}
                                            style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {players.map((p, i) => {
                                    const rank = i;
                                    const gp = p.games_played ?? 0;
                                    const wr = gp > 0 ? Math.round(((p.wins ?? 0) / gp) * 100) : 0;
                                    const isLast = i === players.length - 1;
                                    return (
                                        <tr key={p.username}
                                            className="transition-colors hover:bg-hover"
                                            style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border)', height: 60 }}>
                                            <td className="px-5">
                                                <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{rank + 1}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <Avatar player={p} size={34} />
                                                    <div className="min-w-0">
                                                        <Link href={`/profile/${p.username}`}
                                                            className="text-sm font-medium transition-colors truncate block max-w-[120px] hover:text-accent"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {p.display_name || p.username}
                                                        </Link>
                                                        <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>@{p.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 text-right">
                                                <div className="font-semibold tabular-nums text-accent">{Math.round(p[ratingField] ?? 1200)}</div>
                                                <div className="text-xs capitalize" style={{ color: 'var(--text-tertiary)' }}>{filter === 'all' ? 'rapid' : filter}</div>
                                            </td>
                                            <td className="px-4 text-right text-sm tabular-nums hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>{gp}</td>
                                            <td className="px-4 text-right hidden md:table-cell">
                                                <div className="text-sm tabular-nums mb-1" style={{ color: 'var(--text-secondary)' }}>{wr}%</div>
                                                <div className="h-1 rounded-full overflow-hidden w-16 ml-auto" style={{ background: 'var(--bg-elevated)' }}>
                                                    <div className="h-full rounded-full" style={{ width: `${wr}%`, background: 'var(--green)' }} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-3 gap-3 mt-5">
                        {[
                            { label: 'Total Players', value: players.length },
                            { label: 'Avg Rating', value: Math.round(players.reduce((a,p)=>a+(p[ratingField]??1200),0)/players.length||1200) },
                            { label: 'Online Now', value: '—' },
                        ].map(s => (
                            <div key={s.label} className="rounded-xl p-4 text-center"
                                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                                <div className="text-2xl font-semibold tabular-nums text-accent">{s.value}</div>
                                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
