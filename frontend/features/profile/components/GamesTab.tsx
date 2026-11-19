import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/design/cn';
import type { PlayerOutcome } from '@/lib/chess/gameOutcome';
import type { ProfileGameRow } from '@/types/profilePage';
import { formatDate, gameOutcome } from '../format';
import { opponentRating, ratingChange, signedChange } from '../gameRow';
import { gameHref, profileHref } from '../links';
import { GAME_FILTERS, gameRowDetail, type GameFilter } from '../model';
import { EMPTY, LIST_CARD, LIST_ROW } from './styles';

const OUTCOME_STYLES: Record<
    PlayerOutcome,
    { letter: string; score: string; badge: string; ink: string; bar: string }
> = {
    win: { letter: 'W', score: '1-0', badge: 'bg-success-bg', ink: 'text-success', bar: 'bg-success' },
    loss: { letter: 'L', score: '0-1', badge: 'bg-danger-bg', ink: 'text-danger', bar: 'bg-danger' },
    draw: { letter: 'D', score: '½-½', badge: 'bg-bg-base', ink: 'text-ink-muted', bar: 'bg-ink-muted' },
    aborted: { letter: 'A', score: 'Aborted', badge: 'bg-bg-base', ink: 'text-ink-disabled', bar: 'bg-ink-disabled' },
};

function Opponent({ game, profileId }: { game: ProfileGameRow; profileId: string }) {
    const isWhite = game.white_id === profileId;
    const opp = isWhite ? game.black : game.white;
    return (
        <span className="flex items-center gap-2 font-semibold">
            <span
                aria-hidden="true"
                className={cn(
                    'box-content h-[10px] w-[10px] rounded-3 border-1 border-line-muted',
                    isWhite ? 'bg-ink' : 'bg-on-accent',
                )}
            />
            <span>vs</span>
            {opp?.username ? (
                <Link href={profileHref(opp.username)} className="no-underline">
                    {opp.display_name || opp.username}
                </Link>
            ) : (
                <span>Unknown</span>
            )}
            <span className="font-mono text-[13px] font-medium text-ink-muted">
                ({opponentRating(game, profileId)})
            </span>
        </span>
    );
}

function Accuracy({ value, bar }: { value: number | null; bar: string }) {
    return (
        <span className="flex w-[130px] flex-col gap-[5px]">
            <span className="flex justify-between text-[12px] text-ink-muted">
                <span>Accuracy</span>
                <span className="font-mono text-ink">{value != null ? `${value}%` : '—'}</span>
            </span>
            <span aria-hidden="true" className="h-[5px] rounded-pill bg-bg-base">
                <span className={cn('block h-full rounded-pill', bar)} style={{ width: `${value ?? 0}%` }} />
            </span>
        </span>
    );
}

/** "+8 · Apr 21, 2026": the rating change when the game has a snapshot (F-120), then the date. */
function scoreNote(game: ProfileGameRow, profileId: string): string {
    const change = ratingChange(game, profileId);
    const date = formatDate(game.created_at);
    return change === null ? date : `${signedChange(change)} · ${date}`;
}

/** One Games-tab row: result badge, colour and opponent, speed, the player's accuracy, score and Review. */
function GameRow({ game, profileId }: { game: ProfileGameRow; profileId: string }) {
    const isWhite = game.white_id === profileId;
    const s = OUTCOME_STYLES[gameOutcome(game, profileId)];
    return (
        <div className={LIST_ROW}>
            <span
                aria-hidden="true"
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold',
                    s.badge,
                    s.ink,
                )}
            >
                {s.letter}
            </span>
            <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-[2px]">
                <Opponent game={game} profileId={profileId} />
                <span className="text-[14px] text-ink-muted">{gameRowDetail(game)}</span>
            </span>
            <Accuracy value={isWhite ? game.white_accuracy : game.black_accuracy} bar={s.bar} />
            <span className="flex w-[110px] flex-col items-end">
                <span className="font-mono text-[15px] font-bold">{s.score}</span>
                <span className="text-[12px] text-ink-muted">{scoreNote(game, profileId)}</span>
            </span>
            <Link
                href={gameHref(game.id)}
                className="box-border flex min-h-[40px] w-[84px] items-center justify-center rounded-pill border-1.5 border-line-muted text-[14px] font-semibold text-ink no-underline"
            >
                Review
            </Link>
        </div>
    );
}

export interface GamesTabProps {
    profileId: string;
    /** Lifetime games, for "Showing N of M games". */
    total: number;
    games: ProfileGameRow[];
    shown: ProfileGameRow[];
    filter: GameFilter;
    onFilter: (filter: GameFilter) => void;
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
}

const FILTER_ITEMS = GAME_FILTERS.map((f) => ({ id: f, label: f }));

/** Filter pills, the paginated games list and "Load more games". */
export function GamesTab({
    profileId,
    total,
    games,
    shown,
    filter,
    onFilter,
    loading,
    hasMore,
    onLoadMore,
}: GamesTabProps) {
    const empty = games.length === 0 ? 'No completed games yet.' : 'No games match this filter.';
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs label="Filter games" tone="creamSm" items={FILTER_ITEMS} value={filter} onChange={onFilter} />
                <span className="text-[14px] text-ink-muted">
                    Showing {shown.length} of {total} games
                </span>
            </div>
            <Card className={LIST_CARD}>
                {shown.map((g) => (
                    <GameRow key={g.id} game={g} profileId={profileId} />
                ))}
                {loading && <div className={EMPTY}>Loading games…</div>}
                {!loading && shown.length === 0 && <div className={EMPTY}>{empty}</div>}
            </Card>
            {hasMore && games.length > 0 && !loading && (
                <Button variant="outline" className="self-center" onClick={onLoadMore}>
                    Load more games
                </Button>
            )}
        </>
    );
}
