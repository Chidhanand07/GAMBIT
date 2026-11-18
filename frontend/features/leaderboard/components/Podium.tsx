import Link from 'next/link';
import type { RankRow } from '../leaderboardView';
import { RankAvatar } from './RankAvatar';

const CROWN = 'M2 18h20M4 18 2 7l6 4 4-7 4 7 6-4-2 11';

function Crown() {
    return (
        <svg
            aria-hidden="true"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
        >
            <path d={CROWN} />
        </svg>
    );
}

function Champion({ row }: { row: RankRow }) {
    return (
        <Link
            href={row.href}
            className="box-border flex min-w-0 flex-[1.2_1_200px] flex-col items-center gap-[6px] rounded-20 border-1.5 border-accent bg-surface-raised px-5 pb-6 pt-7 text-center text-ink no-underline"
        >
            <Crown />
            <RankAvatar initial={row.initial} src={row.avatarUrl} size="champion" gold />
            <span className="mt-[6px] font-display text-[22px] font-semibold">{row.name}</span>
            <span className="font-mono text-[44px] font-bold leading-none tracking-[-0.04em] text-accent">
                {row.rating}
            </span>
            <span className="mt-[6px] rounded-pill bg-accent px-3 py-1 text-[13px] font-bold text-on-accent">#1</span>
        </Link>
    );
}

function RunnerUp({ row }: { row: RankRow }) {
    return (
        <Link
            href={row.href}
            className="box-border flex min-w-0 flex-[1_1_180px] flex-col items-center gap-1 rounded-20 border-1 border-line bg-surface p-5 text-center text-ink no-underline"
        >
            <RankAvatar initial={row.initial} src={row.avatarUrl} size="podium" />
            <span className="mt-[6px] font-display text-[18px] font-semibold [overflow-wrap:anywhere]">{row.name}</span>
            <span className="font-mono text-[32px] font-bold leading-[1.1] tracking-[-0.04em]">{row.rating}</span>
            <span className="mt-1 rounded-pill border-1 border-line bg-bg-base px-[10px] py-[3px] text-[13px] font-semibold">
                #{row.rank}
            </span>
        </Link>
    );
}

/** Top three, ordered second / first / third (`slots` from podiumOf); each card links to the profile. */
export function Podium({ slots }: { slots: readonly RankRow[] }) {
    return (
        <div role="group" aria-label="Top three" className="flex flex-wrap items-end gap-3">
            {slots.map((row) =>
                row.rank === 1 ? <Champion key={row.username} row={row} /> : <RunnerUp key={row.username} row={row} />,
            )}
        </div>
    );
}
