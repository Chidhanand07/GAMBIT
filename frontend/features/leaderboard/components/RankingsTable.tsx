import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/design/cn';
import type { RankRow } from '../leaderboardView';
import { RankAvatar } from './RankAvatar';

const GRID = 'grid grid-cols-[44px_minmax(160px,1fr)_96px_72px_150px] items-center gap-x-4 px-5';
const HEADERS = ['#', 'Player', 'Rating', 'Games', 'Win rate'];
const SKELETON_ROWS = 8;

function PlayerCell({ row }: { row: RankRow }) {
    return (
        <span role="cell" className="flex min-w-0 items-center gap-3">
            <RankAvatar initial={row.initial} src={row.avatarUrl} size="row" gold={row.rank === 1} />
            <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-semibold [overflow-wrap:anywhere]">
                    <Link href={row.href} className="text-ink no-underline">
                        {row.name}
                    </Link>
                    {row.you && (
                        <span className="rounded-pill bg-accent px-2 py-[2px] text-[12px] font-bold text-on-accent">
                            You
                        </span>
                    )}
                </span>
                <span className="text-[13px] text-ink-muted [overflow-wrap:anywhere]">{row.handle}</span>
            </span>
        </span>
    );
}

function WinRate({ pct }: { pct: number }) {
    return (
        <span role="cell" className="flex items-center gap-[10px]">
            <span aria-hidden="true" className="flex h-[6px] grow overflow-hidden rounded-pill bg-bg-base">
                <span className="rounded-pill bg-success" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-11 text-right font-mono text-[14px] font-medium">{pct}%</span>
        </span>
    );
}

function RankRowView({ row }: { row: RankRow }) {
    return (
        <div
            role="row"
            className={cn(
                GRID,
                'box-border min-h-[64px] border-b-1 border-line-row py-3',
                row.you ? 'bg-surface-raised' : 'bg-transparent',
            )}
        >
            <span role="cell" className="font-mono text-[15px] font-medium text-ink-muted">
                {row.rank}
            </span>
            <PlayerCell row={row} />
            <span role="cell" className="flex flex-col">
                <span className="font-mono text-[18px] font-bold text-accent">{row.rating}</span>
                <span className="text-[12px] text-ink-muted">{row.pool}</span>
            </span>
            <span role="cell" className="font-mono text-[15px] font-medium">
                {row.games}
            </span>
            <WinRate pct={row.winPct} />
        </div>
    );
}

function TableCard({ children }: { children: ReactNode }) {
    return <div className="overflow-hidden rounded-20 border-1 border-line bg-surface">{children}</div>;
}

export function RankingsSkeleton() {
    return (
        <TableCard>
            <div role="status" aria-label="Loading rankings">
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <div key={i} className="h-16 border-b-1 border-line-row motion-safe:animate-pulse" />
                ))}
            </div>
        </TableCard>
    );
}

export function RankingsEmpty() {
    return (
        <TableCard>
            <div className="flex flex-col items-center gap-1 px-5 py-12 text-center">
                <span className="font-semibold">No ranked players yet</span>
                <span className="text-[14px] text-ink-muted">Play some games to appear here</span>
            </div>
        </TableCard>
    );
}

/** The rankings grid; each row prints its rating pool under the rating ("rapid"). */
export function RankingsTable({ rows }: { rows: readonly RankRow[] }) {
    return (
        <TableCard>
            <div className="overflow-x-auto">
                <div role="table" aria-label="Rankings" className="min-w-[600px]">
                    <div
                        role="row"
                        className={cn(
                            GRID,
                            'border-b-1 border-line bg-surface-header py-[14px] text-[13px] font-semibold text-ink-muted',
                        )}
                    >
                        {HEADERS.map((h) => (
                            <span key={h} role="columnheader">
                                {h}
                            </span>
                        ))}
                    </div>
                    {rows.map((row) => (
                        <RankRowView key={row.username} row={row} />
                    ))}
                </div>
            </div>
        </TableCard>
    );
}
