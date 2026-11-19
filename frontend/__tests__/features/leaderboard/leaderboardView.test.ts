import { LEADERBOARD_SIZE, podiumOf, standingOf, toRankRows, totalsOf, winPercent } from '@/features/leaderboard/leaderboardView'
import { fieldOf } from '@/features/leaderboard/types'

const P = (username: string, rating: number | null, extra: object = {}) => ({
    username, display_name: null, rating_rapid: rating, games_played: 4, wins: 1, ...extra,
})

describe('leaderboardView', () => {
    test('toRankRows: rank, name fallback, initial, rounded rating (1200 when missing), win %, You', () => {
        const rows = toRankRows([P('ann', 1500.6, { display_name: 'ann b' }), P('bo', null)], 'rating_rapid', 'bo')
        expect(rows[0]).toMatchObject({ rank: 1, name: 'ann b', handle: '@ann', initial: 'A', rating: 1501, games: 4, winPct: 25, you: false, href: '/profile/ann', avatarUrl: null })
        expect(rows[1]).toMatchObject({ rank: 2, name: 'bo', rating: 1200, you: true })
        expect(toRankRows([P('x', 1)], 'rating_rapid')[0].you).toBe(false)
    })

    test('winPercent is 0 without games and rounds', () => {
        expect(winPercent(3, 0)).toBe(0)
        expect(winPercent(undefined, undefined)).toBe(0)
        expect(winPercent(2, 3)).toBe(67)
    })

    test('totalsOf: count and mean rating; 1200 for an empty board', () => {
        expect(totalsOf([P('a', 1000), P('b', null)], 'rating_rapid')).toEqual({ players: 2, avgRating: 1100, avgOfTop: false })
        expect(totalsOf([], 'rating_rapid')).toEqual({ players: 0, avgRating: 1200, avgOfTop: false })
    })

    test('totalsOf: a capped list (50 rows) takes the server count, else the count is unknown; the mean is of the top 50', () => {
        const fifty = Array.from({ length: LEADERBOARD_SIZE }, (_, i) => P(`p${i}`, 1500))
        expect(totalsOf(fifty, 'rating_rapid', 1234)).toEqual({ players: 1234, avgRating: 1500, avgOfTop: true })
        expect(totalsOf(fifty, 'rating_rapid')).toEqual({ players: null, avgRating: 1500, avgOfTop: true })
        expect(totalsOf([P('a', 1000)], 'rating_rapid', 7)).toEqual({ players: 7, avgRating: 1000, avgOfTop: false })
    })

    test('podiumOf orders second, first, third and needs three players', () => {
        const rows = toRankRows([P('a', 3), P('b', 2), P('c', 1), P('d', 0)], 'rating_rapid')
        expect(podiumOf(rows).map(r => r.username)).toEqual(['b', 'a', 'c'])
        expect(podiumOf(rows.slice(0, 2))).toEqual([])
    })

    // F-125 (was: standingOf(rows, me, bucket) with the rank from the rows only): the field is the
    // board's column, and the server's rank fills in for a viewer beyond the rows returned.
    test('standingOf: rank on the board or null, rating in the board\'s pool, record', () => {
        const rows = toRankRows([P('a', 3), P('me', 2)], 'rating_rapid')
        const me = { username: 'me', display_name: 'Me', games_played: 10, wins: 7, rating_blitz: 1333.4 }
        expect(standingOf(rows, me, 'rating_blitz')).toEqual({ rank: 2, rating: 1333, name: 'Me', pool: 'blitz', games: 10, winPct: 70 })
        expect(standingOf([], me, 'rating_rapid').rank).toBeNull()
    })

    test('standingOf: beyond the rows returned, the server\'s rank, rating and pool are used [F-125]', () => {
        const me = { username: 'me', display_name: null, games_played: 32, wins: 19, rating_rapid: 1025 }
        expect(standingOf([], me, 'rating_rapid', { rank: 73, rating: 1025, pool: 'rapid' })).toMatchObject({ rank: 73, rating: 1025, pool: 'rapid' })
        expect(standingOf([], me, 'rating_all', { rank: 13, rating: 1239, pool: 'blitz' })).toMatchObject({ rank: 13, rating: 1239, pool: 'blitz' })
        expect(standingOf([], me, 'rating_all')).toMatchObject({ rank: null, rating: null, pool: null })
        const rows = toRankRows([P('a', 3), P('me', 2)], 'rating_rapid')
        expect(standingOf(rows, me, 'rating_rapid', { rank: 99, rating: 1025, pool: 'rapid' }).rank).toBe(2)
    })

    test('toRankRows: the pool under each rating; on All, the pool the best rating comes from [F-125]', () => {
        const all = [
            { username: 'x', display_name: null, rating_all: 1376, rating_blitz: 1376, rating_rapid: 1300, rated_games_blitz: 26, rated_games_rapid: 4 },
            { username: 'y', display_name: null, rating_all: 1228, rating_rapid: 1228, rated_games_rapid: 1 },
        ]
        expect(toRankRows(all, 'rating_all').map((r) => [r.rating, r.pool])).toEqual([[1376, 'blitz'], [1228, 'rapid']])
        expect(toRankRows([P('a', 1500)], 'rating_rapid')[0].pool).toBe('rapid')
    })

    // F-125 (was: 'bucketOf maps All to rapid'): All has its own column.
    test('fieldOf maps All to rating_all and a pool to its column', () => {
        expect(fieldOf('all')).toBe('rating_all')
        expect(fieldOf('classical')).toBe('rating_classical')
    })
})
