"use client";

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { RatingField } from '@/types/timeControl';
import { FilterTabs, type LeaderboardFilter } from '@/features/leaderboard/components/FilterTabs';
import { Podium } from '@/features/leaderboard/components/Podium';
import { LeaderboardTable, StatsStrip } from '@/features/leaderboard/components/LeaderboardTable';
import type { LeaderboardPlayer } from '@/features/leaderboard/types';

const RATING_FIELD: Record<LeaderboardFilter, RatingField> = {
    all: 'rating_rapid', bullet: 'rating_bullet',
    blitz: 'rating_blitz', rapid: 'rating_rapid', classical: 'rating_classical',
};

const SKELETON_ROWS = 8;
const PODIUM_SIZE = 3;

function LeaderboardSkeleton() {
    return (
        <div className="space-y-2">
            {[...Array(SKELETON_ROWS)].map((_, i) => (
                <div key={i} className="skeleton h-[60px] rounded-xl" />
            ))}
        </div>
    );
}

function EmptyLeaderboard() {
    return (
        <div className="text-center py-20" style={{ color: 'var(--text-tertiary)' }}>
            <Trophy size={40} className="mx-auto mb-4 opacity-20" strokeWidth={1} />
            <div className="font-medium mb-1">No ranked players yet</div>
            <div className="text-sm">Play some games to appear here</div>
        </div>
    );
}

export default function LeaderboardPage() {
    const [filter, setFilter] = useState<LeaderboardFilter>('all');
    const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/leaderboard?field=${RATING_FIELD[filter]}`)
            .then(r => r.ok ? r.json() : [])
            .then((data: LeaderboardPlayer[]) => { setPlayers(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [filter]);

    const ratingField = RATING_FIELD[filter];
    const top3 = players.slice(0, PODIUM_SIZE);

    const ranked = (
        <>
            {/* Podium — only if 3+ players */}
            {top3.length >= PODIUM_SIZE && <Podium top3={top3} ratingField={ratingField} />}

            {/* Table */}
            <LeaderboardTable players={players} ratingField={ratingField} bucketLabel={filter === 'all' ? 'rapid' : filter} />

            {/* Stats strip */}
            <StatsStrip players={players} ratingField={ratingField} />
        </>
    );

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
            <FilterTabs value={filter} onChange={setFilter} />

            {loading ? <LeaderboardSkeleton /> : players.length === 0 ? <EmptyLeaderboard /> : ranked}
        </div>
    );
}
