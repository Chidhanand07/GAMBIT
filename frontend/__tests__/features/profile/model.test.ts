import {
    aboutFacts,
    achievements,
    colourRows,
    filterGames,
    statFacts,
    timeControlLabel,
    gameRowDetail,
    friendStatus,
} from '@/features/profile/model';
import type { ProfileGameRow } from '@/types/profilePage';

const record = (gamesPlayed: number, wins: number, losses = 0, draws = 0) => ({
    gamesPlayed,
    wins,
    losses,
    draws,
    winRate: gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0,
});

describe('aboutFacts', () => {
    test('member year, country, games, record and win rate', () => {
        expect(aboutFacts({ created_at: '2023-05-01T12:00:00Z', country: 'India' }, record(10, 6, 3, 1))).toEqual([
            { k: 'Member since', v: '2023' },
            { k: 'Country', v: 'India' },
            { k: 'Games played', v: '10' },
            { k: 'Record', v: '6 W · 3 L · 1 D' },
            { k: 'Win rate', v: '60%' },
        ]);
    });
    test('no country and no games: neither Country nor Win rate', () => {
        const keys = aboutFacts({ created_at: '2024-01-01T00:00:00Z', country: null }, record(0, 0)).map((f) => f.k);
        expect(keys).toEqual(['Member since', 'Games played', 'Record']);
    });
});

describe('achievements', () => {
    test('nothing without wins or games', () => {
        expect(achievements(record(5, 0))).toEqual([]);
    });
    test('first win, highest wins and games milestones reached', () => {
        expect(achievements(record(120, 55)).map((b) => b.name)).toEqual(['First win', '50 wins', '100 games']);
        expect(achievements(record(12, 1)).map((b) => b.name)).toEqual(['First win', '10 games']);
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

describe('friendStatus [F-104]', () => {
    const online = new Set(['a', 'b'])
    test('Online / Offline from presence; Away only when an away set says so', () => {
        expect(friendStatus('a', online)).toBe('Online')
        expect(friendStatus('z', online)).toBe('Offline')
        expect(friendStatus(undefined, online)).toBe('Offline')
        expect(friendStatus('b', online, new Set(['b']))).toBe('Away')
    })
})
