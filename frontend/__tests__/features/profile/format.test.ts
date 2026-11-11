import { accColor, avatarInitial, formatDate, gameOutcome, profileRecord } from '@/features/profile/format';
import { matchesFriendSearch } from '@/features/profile/components/FriendsListCard';

describe('formatDate', () => {
    test('formats as "Mon D, YYYY" (en-US)', () => {
        expect(formatDate('2024-01-05T10:00:00Z')).toBe('Jan 5, 2024');
    });
    test('empty input → empty string', () => {
        expect(formatDate('')).toBe('');
    });
});

describe('accColor', () => {
    test.each([
        [null, 'text-text-tertiary'],
        [100, 'text-indicator-green'],
        [85, 'text-indicator-green'],
        [84.9, 'text-yellow-400'],
        [70, 'text-yellow-400'],
        [69, 'text-red-400'],
        [0, 'text-red-400'],
    ])('%p → %s', (acc, cls) => {
        expect(accColor(acc)).toBe(cls);
    });
});

describe('profileRecord', () => {
    test('rounds the win rate', () => {
        expect(profileRecord({ games_played: 3, wins: 2, losses: 1, draws: 0 })).toEqual({
            gamesPlayed: 3,
            wins: 2,
            losses: 1,
            draws: 0,
            winRate: 67,
        });
    });
    test('missing counters read as 0 and win rate is 0 without games', () => {
        const empty = { games_played: undefined, wins: undefined, losses: undefined, draws: undefined };
        expect(profileRecord(empty as never)).toEqual({ gamesPlayed: 0, wins: 0, losses: 0, draws: 0, winRate: 0 });
    });
});

describe('avatarInitial', () => {
    test.each([
        ['bobby', 'bob', 'B'],
        [null, 'alice', 'A'],
        ['', '', '?'],
        [undefined, undefined, '?'],
    ])('(%p, %p) → %s', (name, username, initial) => {
        expect(avatarInitial(name, username)).toBe(initial);
    });
});

describe('gameOutcome', () => {
    test('win, draw and the LEGACY null-winner loss', () => {
        expect(gameOutcome({ winner_id: 'me', result: 'white' }, 'me')).toEqual({ isWin: true, isDraw: false });
        expect(gameOutcome({ winner_id: null, result: 'draw' }, 'me')).toEqual({ isWin: false, isDraw: true });
        expect(gameOutcome({ winner_id: null, result: 'aborted' }, 'me')).toEqual({ isWin: false, isDraw: false });
    });
});

describe('matchesFriendSearch', () => {
    const erin = { username: 'erin', display_name: 'Erin E' };
    test('empty query matches everyone', () => {
        expect(matchesFriendSearch(erin, '')).toBe(true);
    });
    test('case-insensitive on username or display name', () => {
        expect(matchesFriendSearch(erin, 'ERI')).toBe(true);
        expect(matchesFriendSearch(erin, 'n e')).toBe(true);
        expect(matchesFriendSearch(erin, 'zed')).toBe(false);
    });
    test('null display name is treated as empty', () => {
        expect(matchesFriendSearch({ username: 'frank', display_name: null }, 'null')).toBe(false);
    });
});
