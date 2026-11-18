import { Pill } from '@/components/ui/Pill';
import { Tabs } from '@/components/ui/Tabs';
import type { LeaderboardTotals, RankRow, Standing } from '../leaderboardView';
import { FILTERS, type LeaderboardFilter } from '../types';
import { Podium } from './Podium';
import { RankingsEmpty, RankingsSkeleton, RankingsTable } from './RankingsTable';
import { StandingAside } from './StandingAside';

export interface LeaderboardViewProps {
    filter: LeaderboardFilter;
    onFilterChange: (filter: LeaderboardFilter) => void;
    loading: boolean;
    rows: readonly RankRow[];
    /** Second / first / third, or empty below three players. */
    podium: readonly RankRow[];
    /** Rating pool label under each rating ("rapid"). */
    bucket: string;
    standing: Standing | null;
    totals: LeaderboardTotals;
    onlineNow: number;
    playHref: string;
}

function Rankings({
    loading,
    rows,
    podium,
    bucket,
}: Pick<LeaderboardViewProps, 'loading' | 'rows' | 'podium' | 'bucket'>) {
    if (loading) return <RankingsSkeleton />;
    if (rows.length === 0) return <RankingsEmpty />;
    return (
        <>
            {podium.length > 0 && <Podium slots={podium} />}
            <RankingsTable rows={rows} bucket={bucket} />
        </>
    );
}

/** The leaderboard screen (design/Leaderboard.dc.html), props only. */
export function LeaderboardView(props: LeaderboardViewProps) {
    return (
        <div className="mx-auto box-border flex max-w-[1280px] flex-wrap items-start gap-8 px-8 pb-16 pt-9">
            <section className="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h1 className="m-0 font-display text-[52px] font-bold leading-[1.02] tracking-[-0.03em]">
                        Leaderboard
                    </h1>
                    <Pill dot size="md">
                        Updated live
                    </Pill>
                </div>
                <Tabs
                    label="Time control"
                    items={FILTERS}
                    value={props.filter}
                    onChange={props.onFilterChange}
                    className="self-start"
                />
                <Rankings loading={props.loading} rows={props.rows} podium={props.podium} bucket={props.bucket} />
            </section>
            <StandingAside
                standing={props.standing}
                totals={props.totals}
                onlineNow={props.onlineNow}
                playHref={props.playHref}
            />
        </div>
    );
}
