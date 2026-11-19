import {
    aboutFacts,
    achievements,
    colourRows,
    endingRows,
    filterGames,
    heroChips,
    openingRateTone,
    statFacts,
    timeControlLabel,
    gameRowDetail,
} from '@/features/profile/model';
import type { ProfileGameRow } from '@/types/profilePage';

const record = (gamesPlayed: number, wins: number, losses = 0, draws = 0) => ({
    gamesPlayed,
    wins,
    losses,
    draws,
    winRate: gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0,
});

// F-127 (was: member year, country, games played, record and win rate): the About card is the
// mockup's six facts, "Not set" when empty, then the website when there is one.
describe('aboutFacts [F-127]', () => {
    test("the mockup's facts in order, with labels for the stored choices", () => {
        const facts = aboutFacts({
            created_at: '2023-05-01T12:00:00Z',
            country: 'India',
            favorite_opening: "King's Gambit",
            playing_style: 'aggressive',
            experience: 'club',
            favorite_player: 'Magnus Carlsen',
            website: 'https://lichess.org/@/bob/',
        });
        expect(facts).toEqual([
            { k: 'Member since', v: '2023' },
            { k: 'Country', v: 'India' },
            { k: 'Favorite opening', v: "King's Gambit" },
            { k: 'Playing style', v: 'Aggressive' },
            { k: 'Experience', v: 'Club player' },
            { k: 'Favorite player', v: 'Magnus Carlsen' },
            { k: 'Website', v: 'lichess.org/@/bob', href: 'https://lichess.org/@/bob/' },
        ]);
    });
    test('empty fields read "Not set"; no website, or a non-https one, adds nothing', () => {
        const facts = aboutFacts({ created_at: '2024-01-01T00:00:00Z', country: null, website: 'http://x.example' });
        expect(facts.map((f) => f.v)).toEqual(['2024', 'Not set', 'Not set', 'Not set', 'Not set', 'Not set']);
        expect(aboutFacts({ created_at: '2024-01-01T00:00:00Z', country: null, playing_style: 'wild' })[3].v).toBe('Not set');
    });
});

describe('heroChips [F-127]', () => {
    test('"Country, City", the favourite opening and the playing style, each only when set', () => {
        expect(heroChips({ country: 'India', city: 'Bengaluru', favorite_opening: "King's Gambit", playing_style: 'tactical' })).toEqual([
            'India, Bengaluru',
            "King's Gambit",
            'Tactical',
        ]);
        expect(heroChips({ country: null, city: 'Pune' })).toEqual(['Pune']);
        expect(heroChips({ country: null })).toEqual([]);
    });
});

// F-160 (was: 'first win, highest wins and games milestones reached' → ['First win', '50 wins',
// '100 games']): the badges are Profile.dc.html's four, First win, "N in a row", the games
// milestone and "Top N", the streak and rank from the stats; the wins milestone is not in the mockup.
describe('achievements [F-160]', () => {
    test('nothing without wins or games', () => {
        expect(achievements(record(5, 0))).toEqual([]);
    });
    test('first win and the games milestone from the record alone', () => {
        expect(achievements(record(120, 55)).map((b) => b.name)).toEqual(['First win', '100 games']);
        expect(achievements(record(12, 1)).map((b) => b.name)).toEqual(['First win', '10 games']);
    });
    test("the mockup's four badges, glyphs and notes, from the streak and the best pool's rank", () => {
        const stats = {
            facts: { averageAccuracy: null, longestWinStreak: 4, mostActiveDay: null },
            standing: { pool: 'blitz' as const, rank: 15 },
        };
        expect(achievements(record(32, 20), stats)).toEqual([
            { glyph: '\u265E\uFE0E', name: 'First win', note: 'Won your first game' },
            { glyph: '\u265B\uFE0E', name: '4 in a row', note: 'Best win streak' },
            { glyph: '\u265C\uFE0E', name: '30 games', note: 'Played 30 games' },
            { glyph: '\u265A\uFE0E', name: 'Top 15', note: 'Blitz leaderboard' },
        ]);
    });
    test('a single win is no streak; a rank past the top 50 or no rank earns no "Top" badge', () => {
        const names = (streak: number, standing: { pool: 'rapid'; rank: number } | null) =>
            achievements(record(10, 3), {
                facts: { averageAccuracy: null, longestWinStreak: streak, mostActiveDay: null },
                standing,
            }).map((b) => b.name);
        expect(names(1, { pool: 'rapid', rank: 51 })).toEqual(['First win', '10 games']);
        expect(names(2, null)).toEqual(['First win', '2 in a row', '10 games']);
        expect(names(2, { pool: 'rapid', rank: 50 })).toEqual(['First win', '2 in a row', '10 games', 'Top 50']);
    });
});

describe('filterGames and timeControlLabel', () => {
    const g = (id: string, over: Partial<ProfileGameRow>) =>
        ({ id, white_id: 'me', black_id: 'x', result: null, winner_id: null, status: 'completed', time_control: '10', ...over }) as ProfileGameRow;
    const games = [
        g('win-blitz', { winner_id: 'me', time_control: '3+2' }),
        g('loss-rapid', { winner_id: 'x', time_control: '10' }),
        g('draw-bullet', { result: 'draw', time_control: '1' }),
    ];
    const ids = (filter: Parameters<typeof filterGames>[1]) => filterGames(games, filter, 'me').map((x) => x.id);
    test('All, Wins, Losses, Blitz, Rapid', () => {
        expect(ids('All')).toEqual(['win-blitz', 'loss-rapid', 'draw-bullet']);
        expect(ids('Wins')).toEqual(['win-blitz']);
        expect(ids('Losses')).toEqual(['loss-rapid']);
        expect(ids('Blitz')).toEqual(['win-blitz']);
        expect(ids('Rapid')).toEqual(['loss-rapid']);
    });
    test('label is "<bucket> · <clock>"', () => {
        expect(timeControlLabel('3+2')).toBe('Blitz · 3+2');
        expect(timeControlLabel('30')).toBe('Classical · 30 min');
        expect(timeControlLabel(null)).toBe('Rapid · 10 min');
    });
});

describe('colourRows and statFacts', () => {
    test('record, rate and bar widths per colour; none without a colour split', () => {
        const rows = colourRows({
            byColour: { white: { played: 4, wins: 2, losses: 1, draws: 1 }, black: { played: 0, wins: 0, losses: 0, draws: 0 } },
        });
        expect(rows).toEqual([
            { name: 'White', record: '2-1-1', rate: '50%', w: '50%', d: '25%', l: '25%' },
            { name: 'Black', record: '0-0-0', rate: '0%', w: '0%', d: '0%', l: '0%' },
        ]);
        expect(colourRows({})).toEqual([]);
    });
    test('facts skip what could not be computed', () => {
        expect(statFacts({})).toEqual([]);
        expect(statFacts({ facts: { averageAccuracy: 78, longestWinStreak: 1, mostActiveDay: 'Tuesday' } })).toEqual([
            { k: 'Average accuracy', v: '78%' },
            { k: 'Longest win streak', v: '1 game' },
            { k: 'Most active day', v: 'Tuesday' },
        ]);
        expect(statFacts({ facts: { averageAccuracy: null, longestWinStreak: 4, mostActiveDay: null } })).toEqual([
            { k: 'Longest win streak', v: '4 games' },
        ]);
    });
    test('best win as "vs <rating>" after the win streak, only when known [F-122]', () => {
        const facts = { averageAccuracy: null, longestWinStreak: 2, mostActiveDay: 'Monday' };
        expect(statFacts({ facts: { ...facts, bestWin: 1250 } })).toEqual([
            { k: 'Longest win streak', v: '2 games' },
            { k: 'Best win', v: 'vs 1250' },
            { k: 'Most active day', v: 'Monday' },
        ]);
        expect(statFacts({ facts: { ...facts, bestWin: null } }).map((f) => f.k)).not.toContain('Best win');
    });
});

describe('gameRowDetail [F-104]', () => {
    test('with opening and move count: the mockup line "Opening · clock · N moves"', () => {
        expect(gameRowDetail({ time_control: '5+0', opening: 'Italian Game', move_count: 34 })).toBe('Italian Game · 5 min · 34 moves')
    })
    test('without them: bucket · clock, as before (no placeholder)', () => {
        expect(gameRowDetail({ time_control: '3+2' })).toBe('Blitz · 3+2')
        expect(gameRowDetail({ time_control: '3+2', opening: null, move_count: null })).toBe('Blitz · 3+2')
        expect(gameRowDetail({ time_control: '10+0', move_count: 0 })).toBe('Rapid · 10 min · 0 moves')
    })
})

describe('openingRateTone [F-123]', () => {
    test.each([
        [73, 'good'],
        [60, 'good'],
        [59, 'even'],
        [45, 'even'],
        [44, 'poor'],
        [0, 'poor'],
    ])('%p%% → %s', (rate, tone) => {
        expect(openingRateTone(rate)).toBe(tone);
    });
});

describe('statFacts order and game length [F-124]', () => {
    test("the mockup's six tiles in order", () => {
        const facts = {
            averageAccuracy: 78,
            averageGameLength: 34,
            longestWinStreak: 4,
            bestWin: 1250,
            fastestWin: 1,
            mostActiveDay: 'Tuesday',
        };
        expect(statFacts({ facts })).toEqual([
            { k: 'Average accuracy', v: '78%' },
            { k: 'Average game length', v: '34 moves' },
            { k: 'Longest win streak', v: '4 games' },
            { k: 'Best win', v: 'vs 1250' },
            { k: 'Fastest win', v: '1 move' },
            { k: 'Most active day', v: 'Tuesday' },
        ]);
    });
});

describe('endingRows [F-124]', () => {
    test('each row with its share of the games counted', () => {
        const endings = [
            { name: 'Checkmate', count: 11 },
            { name: 'Resignation', count: 9 },
            { name: 'Abandoned', count: 0 },
        ];
        expect(endingRows({ endings })).toEqual([
            { name: 'Checkmate', n: 11, pct: '55%' },
            { name: 'Resignation', n: 9, pct: '45%' },
            { name: 'Abandoned', n: 0, pct: '0%' },
        ]);
    });
    test('nothing to show without games', () => {
        expect(endingRows({})).toEqual([]);
        expect(endingRows({ endings: [{ name: 'Checkmate', count: 0 }] })).toEqual([]);
    });
});
