import { podiumOf, standingOf, toRankRows, totalsOf, winPercent } from '@/features/leaderboard/leaderboardView'
import { bucketOf } from '@/features/leaderboard/types'

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
        expect(totalsOf([P('a', 1000), P('b', null)], 'rating_rapid')).toEqual({ players: 2, avgRating: 1100 })
        expect(totalsOf([], 'rating_rapid')).toEqual({ players: 0, avgRating: 1200 })
    })

    test('podiumOf orders second, first, third and needs three players', () => {
        const rows = toRankRows([P('a', 3), P('b', 2), P('c', 1), P('d', 0)], 'rating_rapid')
        expect(podiumOf(rows).map(r => r.username)).toEqual(['b', 'a', 'c'])
        expect(podiumOf(rows.slice(0, 2))).toEqual([])
    })

    test('standingOf: rank on the board or null, rating in the bucket, record', () => {
        const rows = toRankRows([P('a', 3), P('me', 2)], 'rating_rapid')
        const me = { username: 'me', display_name: 'Me', games_played: 10, wins: 7, rating_blitz: 1333.4 }
        expect(standingOf(rows, me, 'blitz')).toEqual({ rank: 2, rating: 1333, name: 'Me', bucket: 'blitz', games: 10, winPct: 70 })
        expect(standingOf([], me, 'rapid').rank).toBeNull()
    })

    test('bucketOf maps All to rapid', () => {
        expect(bucketOf('all')).toBe('rapid')
        expect(bucketOf('classical')).toBe('classical')
    })
})
