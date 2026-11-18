// Pure view-model helpers for the redesigned profile page (design/Profile.dc.html).
import type { PlayerOutcome } from '@/lib/chess/gameOutcome';
import { classifyTimeControl, displayTimeControl, SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { Friend } from '@/types/friendship';
import type { Profile } from '@/types/profile';
import type { CategoryRecord, ProfileGameRow, ProfileStats } from '@/types/profilePage';
import type { SpeedBucket } from '@/types/timeControl';
import { gameOutcome, type ProfileRecord } from './format';

const PERCENT = 100;

export interface Fact {
    k: string;
    v: string;
}

/** The About card: only facts the profile row really carries. */
export function aboutFacts(profile: Pick<Profile, 'created_at' | 'country'>, record: ProfileRecord): Fact[] {
    const facts: Fact[] = [];
    if (profile.created_at) facts.push({ k: 'Member since', v: String(new Date(profile.created_at).getFullYear()) });
    if (profile.country) facts.push({ k: 'Country', v: profile.country });
    facts.push({ k: 'Games played', v: String(record.gamesPlayed) });
    facts.push({ k: 'Record', v: `${record.wins} W · ${record.losses} L · ${record.draws} D` });
    if (record.gamesPlayed > 0) facts.push({ k: 'Win rate', v: `${record.winRate}%` });
    return facts;
}

export interface Badge {
    glyph: string;
    name: string;
    note: string;
}

const GAME_MILESTONES = [500, 100, 30, 10] as const;
const WIN_MILESTONES = [100, 50, 10] as const;

/** Achievements earned from the lifetime counters (first win, games and wins milestones). */
export function achievements(record: ProfileRecord): Badge[] {
    const badges: Badge[] = [];
    if (record.wins > 0) badges.push({ glyph: '♞︎', name: 'First win', note: 'Won your first game' });
    const wins = WIN_MILESTONES.find((n) => record.wins >= n);
    if (wins) badges.push({ glyph: '♛︎', name: `${wins} wins`, note: `Won ${wins} games` });
    const games = GAME_MILESTONES.find((n) => record.gamesPlayed >= n);
    if (games) badges.push({ glyph: '♜︎', name: `${games} games`, note: `Played ${games} games` });
    return badges;
}

export function matchesFriendSearch(friend: Pick<Friend, 'username' | 'display_name'>, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return (friend.username ?? '').toLowerCase().includes(q) || (friend.display_name ?? '').toLowerCase().includes(q);
}

export type GameFilter = 'All' | 'Wins' | 'Losses' | 'Blitz' | 'Rapid';
export const GAME_FILTERS: readonly GameFilter[] = ['All', 'Wins', 'Losses', 'Blitz', 'Rapid'];

const FILTER_TEST: Record<GameFilter, (outcome: PlayerOutcome, bucket: SpeedBucket) => boolean> = {
    All: () => true,
    Wins: (o) => o === 'win',
    Losses: (o) => o === 'loss',
    Blitz: (_o, b) => b === 'blitz',
    Rapid: (_o, b) => b === 'rapid',
};

/** The loaded games that pass a Games-tab filter. */
export function filterGames(games: ProfileGameRow[], filter: GameFilter, profileId: string): ProfileGameRow[] {
    const test = FILTER_TEST[filter];
    return games.filter((g) => test(gameOutcome(g, profileId), classifyTimeControl(g.time_control)));
}

/** "Rapid · 10 min" / "Blitz · 3+2": the speed bucket and the clock of a stored time control. */
export function timeControlLabel(timeControl: string | null): string {
    return `${SPEED_BUCKET_LABELS[classifyTimeControl(timeControl)]} · ${displayTimeControl(timeControl)}`;
}

export type FriendStatus = 'Online' | 'Away' | 'Offline';

/**
 * A friend's status in the Overview's Friends card (Profile.dc.html: Online, Away, Offline).
 * "Away" needs `awayIds`, which presence does not provide yet (data-live track).
 */
export function friendStatus(
    id: string | undefined,
    onlineIds: ReadonlySet<string>,
    awayIds?: ReadonlySet<string>,
): FriendStatus {
    if (!id) return 'Offline';
    if (awayIds?.has(id)) return 'Away';
    return onlineIds.has(id) ? 'Online' : 'Offline';
}

/**
 * A Games-tab row's second line, as in Profile.dc.html: "Italian Game · 5 min · 34 moves". Without
 * an opening the speed bucket takes its place ("Blitz · 5 min"); the move count is left out when
 * unknown. Never a placeholder.
 */
export function gameRowDetail(game: Pick<ProfileGameRow, 'time_control' | 'opening' | 'move_count'>): string {
    const lead = game.opening || SPEED_BUCKET_LABELS[classifyTimeControl(game.time_control)];
    const parts = [lead, displayTimeControl(game.time_control)];
    if (typeof game.move_count === 'number') parts.push(`${game.move_count} moves`);
    return parts.join(' · ');
}

export interface ColourRow {
    name: 'White' | 'Black';
    record: string;
    rate: string;
    w: string;
    d: string;
    l: string;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * PERCENT) : 0);

function colourRow(name: ColourRow['name'], r: CategoryRecord): ColourRow {
    return {
        name,
        record: `${r.wins}-${r.losses}-${r.draws}`,
        rate: `${pct(r.wins, r.played)}%`,
        w: `${pct(r.wins, r.played)}%`,
        d: `${pct(r.draws, r.played)}%`,
        l: `${pct(r.losses, r.played)}%`,
    };
}

/** "Results by colour" rows; empty when the stats carry no colour split. */
export function colourRows(stats: ProfileStats): ColourRow[] {
    const rows: ColourRow[] = [];
    if (stats.byColour?.white) rows.push(colourRow('White', stats.byColour.white));
    if (stats.byColour?.black) rows.push(colourRow('Black', stats.byColour.black));
    return rows;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const movesText = (n: number | null | undefined) => (isNumber(n) ? plural(n, 'move', 'moves') : null);

/** Stats-tab fact tiles in the mockup's order, only for facts the API could compute. */
export function statFacts(stats: ProfileStats): Fact[] {
    const f = stats.facts;
    if (!f) return [];
    const facts: [string, string | null][] = [
        ['Average accuracy', isNumber(f.averageAccuracy) ? `${f.averageAccuracy}%` : null],
        ['Average game length', movesText(f.averageGameLength)],
        ['Longest win streak', plural(f.longestWinStreak, 'game', 'games')],
        ['Best win', isNumber(f.bestWin) ? `vs ${f.bestWin}` : null],
        ['Fastest win', movesText(f.fastestWin)],
        ['Most active day', f.mostActiveDay || null],
    ];
    return facts.filter((x): x is [string, string] => x[1] !== null).map(([k, v]) => ({ k, v }));
}

export interface EndingRow {
    name: string;
    n: number;
    /** Share of the games counted, as a CSS width ("34%"). */
    pct: string;
}

/** "How games end" bars: each row's share of all the games counted. Empty without games. */
export function endingRows(stats: ProfileStats): EndingRow[] {
    const rows = stats.endings ?? [];
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    if (total === 0) return [];
    return rows.map((r) => ({ name: r.name, n: r.count, pct: `${pct(r.count, total)}%` }));
}

/** Win rates from this percentage up read as good (green), below EVEN_RATE as poor (red). */
const GOOD_RATE = 60;
const EVEN_RATE = 45;

/** The colour band of an opening's win rate (Profile.dc.html: ≥ 60 green, ≥ 45 cream, else red). */
export function openingRateTone(winRate: number): 'good' | 'even' | 'poor' {
    if (winRate >= GOOD_RATE) return 'good';
    return winRate >= EVEN_RATE ? 'even' : 'poor';
}
